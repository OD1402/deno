#!/usr/bin/env -S deno run --allow-net --allow-run --allow-write
import Tuner from "https://deno.land/x/tuner@v0.1.4/mod.ts";
export const tuner = await Tuner.use.loadConfig();

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { sleep } from "https://deno.land/x/sleep@v1.3.0/mod.ts"
import { SendToDip } from "./send-to-dip.js";
import { SendSoldToMls } from "./send-sold-to-mls.js";
import postgres from "https://deno.land/x/postgresjs@v3.4.3/mod.js";

const sql = postgres(tuner.config.db);
export default sql;


let facet_orsk = {
    11: { name: 'ГАРАЖ', file_name: 'garage' },
    12: { name: 'ДОМ', file_name: 'house' },
    13: { name: 'ЗЕМЕЛЬНЫЙ УЧАСТОК', file_name: 'lot' },
    14: { name: 'КВАРТИРА', file_name: 'flat' },
    15: { name: 'КОМНАТА', file_name: 'room' },
    16: { name: 'НЕЖИЛОЕ ПОМЕЩЕНИЕ', file_name: 'commre' },
    17: { name: 'САРАЙ', file_name: 'barn' },
    82: { name: 'САД', file_name: 'garden' },
};

let getResponse = async function (url, referrer) {
    await sleep(1);
    let response = await fetch(url, {
        method: "GET",
        // и так работает, без хэдеров и тд, не будем усложнять
        // headers: {
        //     "Content-Type": "application/json",
        // },
        // "referrer": "https://board.orsk.ru/index.php?r=category&category_id=82&ads_type[]=5940",
    });

    let responseText = await response.text();

    if (404 == response.status) {
        console.log('status =', response.status, ' пропустим эту страницу')
        return;
    } else if (200 != response.status) {
        // TODO! перезапрашивать надо только 500ые, в идеале повесить счетчик на кол-во перезапросов
        console.log('status =', response.status, ' попробуем еще раз получить данные')
        await sleep(3)
        await getResponse(url);
    } else {
        return responseText;
    }
};


let cardScan = async function (external_url, external_id, facet_id, scan_session) {
    let card_json = {
        facet: facet_orsk[facet_id].name,
        external_id: external_id,
        external_url: external_url,
        external_date: null,
        external_timestampt: null,
        title: null,
        price: null,
        seller: null,
        phone: null,
        city: null,
        options: null
    };

    let card_text = await getResponse(external_url);
    console.log(external_url)

    if (card_text) {
        let document = new DOMParser().parseFromString(
            card_text,
            "text/html",
        );

        let matchDate = /span class="f-gray s12">\s*Обновлено\s*(.+?)\s*<\/span>/i.exec(card_text);
        if (matchDate) {
            card_json.external_date = matchDate[1];

            let timestampt = matchDate[1].replace(/(\d{2})[\.-\/](\d{2})[\.-\/](\d{4})/, "$3-$2-$1");
            timestampt = Date.parse(timestampt + '+0500');
            if (timestampt) {
                card_json.external_timestampt = timestampt;
            }
        }

        let title = document.getElementsByClassName('view-title');
        if (title) {
            card_json.title = title[0].textContent;
        }

        let cena = document.getElementsByClassName('view-header-cena');
        if (cena) {
            card_json.price = cena[0].textContent;
        }

        let matchSeller = /<td>\s*(.+?)\s*<\/td>\s*<td class="view-header-phone">/i.exec(card_text);
        if (matchSeller) {
            card_json.seller = matchSeller[1];
        }

        let matchPhone = /<div class="phone">\s*(.+?)\s*<\/div>/i.exec(card_text);
        if (matchPhone) {
            card_json.phone = matchPhone[1];
        }

        let matchCity = /<td class="view-header-city">\s*(.+?)\s*<\/td>/i.exec(card_text);
        if (matchCity) {
            card_json.city = matchCity[1];
        }

        let options = {};
        let table = document.getElementsByClassName("view-options");
        let attr = table[0].getElementsByTagNameNS(
            "view-options",
            "span",
        );
        let keyOp = [];
        let valOp = [];

        let i = 1;
        for (let item of attr) {
            item = item.textContent;
            if ((i & 1) === 1) {
                keyOp.push(item.replace(':', ''))
            } else {
                valOp.push(item)
            }
            i++
        }

        keyOp.forEach((keyItem, keyIdx) => {
            valOp.forEach((valItem, valIdx) => {
                if (valIdx == keyIdx) {
                    options[keyItem] = valItem;
                }
            })
        })
        card_json.options = options;


        let photo = [];
        let fotorama = document.getElementsByClassName("fotorama");
        if (fotorama[0]) {
            let imgs = fotorama[0].getElementsByTagNameNS(
                "fotorama",
                "a",
            );
            for (let img of imgs) {
                img = img.childNodes[0].outerHTML
                    .replace('<img src="', '')
                    .replace('" alt="">', '')
                    .replace('/p/', '/b/');
                if (img) {
                    photo.push(img)
                }
            }
            card_json.photo = photo;
        }


        if (card_json) {
            for (var key in card_json) {

                if (typeof card_json[key] == 'string') {
                    card_json[key] = card_json[key].trim();
                }

                if (!card_json[key]) {
                    console.log(' !!!!!!!!!!!  Не удалось получить ', key)
                    // throw new Error('Не удалось получить ', key, ' - ', external_url);
                }
            }
            card_json.external_id = parseInt(card_json.external_id);

            // console.log('card_json', card_json)

            // сохраним карточку в БД
            let add_card = await sql`SELECT add_card_shot(${scan_session}, ${card_json})`
            console.log('ADD card to db: external_id =', card_json.external_id);
            // console.log('add_card ', add_card)

            // отправим карточку в dip
            let dip_card = {
                workerName: 'process-source-wcrawler',
                params: {
                    params: {
                        dip_module_id: 24,
                        fileName: "orsk-" + facet_orsk[facet_id].file_name
                    },
                    source: [card_json]
                }
            };
            await SendToDip(dip_card);
        }
    }
}


let listScan = async function (url, page, facet_id, scan_session) {
    console.log('==============================')
    console.log('Сканируем раздел', facet_orsk[facet_id].name, '| page', page, '| scan_session', scan_session);
    console.log(url)

    let list_text = await getResponse(url);
    // let list_text = await Deno.readTextFile("list_test.html");

    if (list_text) {
        let document = new DOMParser().parseFromString(
            list_text,
            "text/html",
        );

        let rxCardId = /data-key="(\d+)"/g;
        let matchСardId;

        while ((matchСardId = rxCardId.exec(list_text)) !== null) {
            let external_url = 'https://board.orsk.ru/index.php?r=view&id=' + matchСardId[1];
            await cardScan(external_url, matchСardId[1], facet_id, scan_session);
        }

        /////////////////////////////////////////

        let max_page = 0;
        let next_page_num = page + 1;
        let next_page_url;

        let last_page = document.getElementsByClassName('last');
        let last_page_disabled = document.getElementsByClassName('last disabled');

        if (last_page && last_page[0] && !last_page_disabled[0]) {
            let match = /data-page="(\d+)"/i.exec(last_page[0].outerHTML);
            if (match) {
                max_page = parseInt(match[1]) + 1;
                console.log('max_page ', max_page)
            } else {
                console.log('!!!!!!!!!! Не смогли найти сколько всего в выборке страниц ')
            }
        }

        if (max_page && max_page >= next_page_num) {
            next_page_url = `https://board.orsk.ru/index.php?r=category%2Findex&category_id=${facet_id}&ads_type%5B0%5D=5940&page=${next_page_num}&per-page=100`;

            console.log('next_page_num', next_page_num);
            console.log('page', page);

            await listScan(next_page_url, next_page_num, facet_id, scan_session);
        } else {
            // Закончили сканирование раздела, закрываем сессию
            await sql`UPDATE scan_sessionlar SET finished_at = NOW() WHERE id = ${scan_session}`
            console.log('Закрыли сессию', facet_orsk[facet_id].name, '| scan_session', scan_session);

            // Снимаем с публикации объявление, которые не встретили в последней сессии
            await SendSoldToMls(facet_id);
            console.log('Закончили сканировать раздел', facet_orsk[facet_id].name, '| scan_session', scan_session);
            console.log(' ');
        }
    }
};

for (var facet_id in facet_orsk) {
    let url = `https://board.orsk.ru/index.php?r=category&category_id=${facet_id}&ads_type[]=5940`

    // Получим id сессии - новой или незавершенной
    let scan_session = await sql`SELECT add_scan_session(${facet_id})`;
    scan_session = scan_session[0].add_scan_session;
    console.log('Получили scan_session =', scan_session);

    await listScan(url, 1, facet_id, scan_session);
}

console.log('Закончили сканировать все разделы')
await sql.end();
Deno.exit();