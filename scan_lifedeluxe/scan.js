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

// 33 объявление на странице
// кол-во страниц не ограничено

let external_facet = {
    1: { name: 'ПРОДАЖА СПБ', file_name: 'sale-all-spb', town: 'spb', path: '/catalog/operation_type/sale' },
    2: { name: 'АРЕНДА СПБ', file_name: 'rent-all-spb', town: 'spb', path: '/catalog/operation_type/rent' },

    // 3: { name: 'ПРОДАЖА КВ МСК', file_name: 'sale-flat-msk', town: 'msk', path: '/prodazha-kvartir' },
    // 4: { name: 'ПРОДАЖА ДОМА МСК', file_name: 'sale-house-msk', town: 'msk', path: '/prodazha-domov' },
    // 5: { name: 'ПРОДАЖА НОВОСТРОЙКИ МСК', file_name: 'sale-flat_new-msk', town: 'msk', path: '/novostroyki' },
    // 6: { name: 'АРЕНДА КВ МСК', file_name: 'rent-flat-msk', town: 'msk', path: '/arenda-kvartir' },
    // 7: { name: 'АРЕНДА ДОМА МСК', file_name: 'rent-house-msk', town: 'msk', path: '/arenda-domov' }
};

// Спб
// https://lifedeluxe.ru/catalog/operation_type/sale
// https://lifedeluxe.ru/catalog/operation_type/rent


// Мск
// https://msk.lifedeluxe.ru/prodazha-kvartir/2 - продажа квартир
// https://msk.lifedeluxe.ru/prodazha-domov - продажа домов
// https://msk.lifedeluxe.ru/novostroyki - новостройки
// https://msk.lifedeluxe.ru/arenda-kvartir - аренда квартир
// https://msk.lifedeluxe.ru/arenda-domov/2 - аренда домов


let getResponse = async function (url, referrer) {
    await sleep(0.5);
    let response = await fetch(url, {
        method: "GET",
        // не защищаются вообще, не будем усложнять
        // headers: {
        //     "Content-Type": "application/json",
        // },
        // "referrer": "",
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


let cardScan = async function (external_url, facet_id, scan_session) {
    let card_json = {
        facet: external_facet[facet_id].name,
        external_id: null,
        external_url: external_url,
        external_date: null,
        external_timestamp: null,
        title: null,
        region: null,
        address: null,
        coordinates: {},
        price: null,
        seller: null,
        phone: null,
        // options: null, // ПОДРОБНЫЕ ХАРАКТЕРИСТИКИ
        // building:  null, // ИНФОРМАЦИЯ О ДОМЕ  https://lifedeluxe.ru/catalog/view/195619
        description: null,
        photo: null
    };

    let matchExternalId = /view\/(\d+)/.exec(external_url);
    if (matchExternalId) {
        card_json.external_id = matchExternalId[1];
    }

    if (external_facet[facet_id].town == 'spb') {
        card_json.region = 'Санкт-Петербург г.'
    } else {
        card_json.region = 'Москва г.'
    }

    let card_text = await getResponse(external_url);

    if (card_text) {
        let document = new DOMParser().parseFromString(
            card_text,
            "text/html",
        );

        let matchExternalDate = document.getElementsByClassName('detail_date_add');
        if (matchExternalDate) {
            card_json.external_date = matchExternalDate[0].textContent;

            // Размещено 1 августа 2024 г.
            // Размещено 10 июля 2024 г.
            // Размещено более месяца назад

            let day;
            let month;
            let year;
            let timestampt;

            let matchDate = /Размещено (\d+) ([а-я]+) (\d+) г/i.exec(card_json.external_date);

            if (card_json.external_date.includes('более месяца назад')) {
                // сегодня минус месяц
                timestampt = new Date().setMonth(new Date().getMonth() - 1);
            } else if (matchDate) {
                day = matchDate[1];

                switch (matchDate[2]) {
                    case 'января': month = '01'; break;
                    case 'февраля': month = '02'; break;
                    case 'марта': month = '03'; break;
                    case 'апреля': month = '04'; break;
                    case 'мая': month = '05'; break;
                    case 'июня': month = '06'; break;
                    case 'июля': month = '07'; break;
                    case 'августа': month = '08'; break;
                    case 'сентября': month = '09'; break;
                    case 'октября': month = '10'; break;
                    case 'ноября': month = '11'; break;
                    case 'декабря': month = '12'; break;
                    default: break;
                }

                year = matchDate[3];
            } else {
                console.log(' !!!!!!!!!!!  получилось распарсить дату', card_json.external_date)
            }

            if (day && month && year) {
                timestampt = Date.parse(year + '-' + month + '-' + day);
            }

            if (timestampt) {
                card_json.external_timestamp = timestampt;
            }
        }

        let title = document.getElementsByClassName('col-md detail-left-params');
        if (title) {
            let titleSmall = title[0].getElementsByClassName('small');
            if (titleSmall) {
                card_json.title = titleSmall[0].textContent;
            }
        }


        let detail_left = document.getElementsByClassName('col-md detail-left-params');
        if (detail_left) {
            let el = detail_left[0].querySelector('h1').textContent;
            if (el) {
                card_json.address = el.trim();
            }
        }

        if (!card_json.address) {
            let address = document.getElementsByClassName('address');
            if (address) {
                card_json.address = address[0].textContent;
            }
        }


        let price = document.getElementsByClassName('price');
        if (price) {
            card_json.price = price[0].textContent;
        }

        let phone1 = document.getElementsByClassName('phone');
        let phone2 = document.getElementsByClassName('col-xxl-auto detail-top-phone');
        if (phone1 && phone1[0]) {
            card_json.phone = phone1[0].textContent;
        } else if (phone2 && phone2[0]) {
            card_json.phone = phone2[0].textContent;
        } else {
            console.log('нет телефона')
        }

        let seller = document.getElementsByClassName('company-name');
        if (seller) {
            card_json.seller = seller[0].textContent;

            let href = seller[0].getAttribute('href');
            if (href) {
                card_json.seller_url = 'https://lifedeluxe.ru' + href;
            }
        }


        let margin_30 = document.getElementsByClassName('margin_30');
        if (margin_30) {
            let iframeElement = margin_30[1].querySelector('iframe');
            if (iframeElement) {
                let src = iframeElement.getAttribute('src');
                if (src) {
                    card_json.video = src;
                }
            }
        }


        let description = document.getElementsByClassName('ld_description');
        if (description) {
            card_json.description = description[0].innerHTML  // textContent;
        }


        let photo = [];
        let rxPhoto = /<a href="(.+?)" data-fancybox="gallery" class="(detail_gallery_image|detail_gallery_image selected)\s*"/ig;
        let matchPhoto;

        while ((matchPhoto = rxPhoto.exec(card_text)) !== null) {
            photo.push(matchPhoto[1]);
        }
        card_json.photo = photo;

        let map = document.getElementById('detail_page_map_wrap');
        if (map) {
            let lat = map.getAttribute('data-lat');
            if (lat) {
                card_json.coordinates.lat = lat;
            }
            let lon = map.getAttribute('data-lon');
            if (lon) {
                card_json.coordinates.lon = lon;
            }
        }


        let options = {};
        let table = document.getElementsByClassName("table table-striped");
        let attr = table[0].getElementsByTagNameNS(
            "table table-striped",
            "td",
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


        // console.log('card_json', card_json)

        // console.log('card_json.external_date', card_json.external_date)

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
            //console.log('add_card ', add_card)

            // отправим карточку в dip
            let dip_card = {
                workerName: 'process-source-wcrawler',
                params: {
                    params: {
                        dip_module_id: 25,
                        fileName: "lifedeluxe-" + external_facet[facet_id].file_name
                    },
                    source: [card_json]
                }
            };
            await SendToDip(dip_card);
        }
        console.log('===================')
    }
}


let listScan = async function (url, page, facet_id, scan_session) {
    console.log('==============================')
    console.log('Сканируем раздел', external_facet[facet_id].name, '| page', page, '| scan_session', scan_session);
    console.log(url)

    let list_text = await getResponse(url);
    // let list_text = await Deno.readTextFile("list_test.html");

    if (list_text) {
        let document = new DOMParser().parseFromString(
            list_text,
            "text/html",
        );

        let rxCardId = /<a href="(\/catalog\/view\/\d+)" class="item col-md-4">/g;
        let matchСardId;

        while ((matchСardId = rxCardId.exec(list_text)) !== null) {
            let external_url = 'https://lifedeluxe.ru' + matchСardId[1];

            console.log(external_url)
            await cardScan(external_url, facet_id, scan_session);
        }


        let max_page = 0;
        let total_card_on_page = 33;

        let next_page_url;
        let next_page_num = page + 1;

        if (external_facet[facet_id].town == 'spb') {
            if (url.includes("page")) {
                next_page_url = url.replace(/\d+/, next_page_num);
            } else {
                next_page_url = url + '/page/' + next_page_num;
            }
        } else {
            // москва
        }

        let matchTotalCard = /всего найдено\s+(\d+)\s+предложени/i.exec(list_text);
        if (matchTotalCard && matchTotalCard[1]) {
            let total_card = parseInt(matchTotalCard[1]);
            max_page = Math.ceil(total_card / total_card_on_page);
        } else {
            console.log('!!!!!!!! Не нашли данные о колчестве объявлений')
            return;
        }

        console.log('max_page', max_page);


        if (max_page >= next_page_num) {
            let parsedUrl = new URL(next_page_url);

            if (list_text.includes(parsedUrl.pathname)) {
                console.log('page', page);
                console.log('next_page_num', next_page_num);
                await listScan(next_page_url, next_page_num, facet_id, scan_session);
            } else {
                console.log('!!!!!!!! Не нашли ссылку на следующую страницу');
                return;
            }
        } else {
            // Закончили сканирование раздела, закрываем сессию
            await sql`UPDATE scan_sessionlar SET finished_at = NOW() WHERE id = ${scan_session}`
            console.log('Закрыли сессию', external_facet[facet_id].name, '| scan_session', scan_session);

            // Снимаем с публикации объявление, которые не встретили в последней сессии
            await SendSoldToMls(facet_id);
            console.log('Закончили сканировать раздел', external_facet[facet_id].name, '| scan_session', scan_session);
            console.log(' ');
        }
    }
};

for (var facet_id in external_facet) {

    let url = `https://lifedeluxe.ru${external_facet[facet_id].path}`;

    // let url = 'https://lifedeluxe.ru/catalog/flats/operation_type/sale/rooms/-1/price_from/120000000/price_to/120000000'

    // Получим id сессии - новой или незавершенной
    let scan_session = await sql`SELECT add_scan_session(${facet_id})`;
    scan_session = scan_session[0].add_scan_session;
    console.log('Получили scan_session =', scan_session);

    await listScan(url, 1, facet_id, scan_session);
}

console.log('Закончили сканировать все разделы')
await sql.end();
Deno.exit();