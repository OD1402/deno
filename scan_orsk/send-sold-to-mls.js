import Tuner from "https://deno.land/x/tuner@v0.1.4/mod.ts";
export const tuner = await Tuner.use.loadConfig();

import postgres from "https://deno.land/x/postgresjs@v3.4.3/mod.js";
const sql = postgres(tuner.config.db);
export default sql;


let getMlsGuid = async function (sold_list) {
    let mlsGuidList = [];

    for (let item of sold_list) {
        let response = await fetch(tuner.config.mls_elastic + `_search?q=external_id:${item.orsk_id}%20AND%20project_id:27`);
        let responseJson = await response.json();

        if (responseJson.hits && responseJson.hits.hits && responseJson.hits.hits.length) {
            responseJson.hits.hits.forEach(adv => {
                mlsGuidList.push(adv._source.guid);
            });
        }
    }
    return mlsGuidList;
};


let putStatusSold = async function (mlsGuidList) {
    if (mlsGuidList.length) {
        let responseSold = await fetch(tuner.config.mls_sold, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Access-Token": tuner.config.mls_access_token
            },
            body: JSON.stringify(mlsGuidList)
        });

        if (responseSold.status == 200) {
            console.log('Выставили "продано" объявлениям: ', mlsGuidList)
        } else if (responseSold.status == 504) {
            console.error('status == 504, попробуем еще раз получить данные')
            putStatusSold(mlsGuidList);
        } else {
            console.log('!!!!!!!! Не удалось получить данные из МЛС')
            console.log('responseSold', responseSold)
            return false;
        }
    }
    return true;
};



export async function SendSoldToMls(facet_id) {
    // Найдем прошлую завершенную сессию по разделу
    let sold_list = [];

    let scan_sessions = await sql`SELECT 
            id 
            FROM 
            scan_sessionlar 
            WHERE 
            facet = ${facet_id} AND 
            finished_at IS NOT NULL 
            ORDER BY id DESC 
            limit 3`

    if (scan_sessions.length == 3) {
        let actual_scan = await sql`SELECT 
        orsk_id 
        FROM 
        card_shotlar 
        WHERE 
        scan_session = ${scan_sessions[0].id}`

        let actual_scan_2 = await sql`SELECT 
        orsk_id 
        FROM 
        card_shotlar 
        WHERE 
        scan_session = ${scan_sessions[1].id}`

        actual_scan = actual_scan.concat(actual_scan_2);

        let last_scan = await sql`SELECT 
        orsk_id 
        FROM 
        card_shotlar 
        WHERE 
        scan_session = ${scan_sessions[2].id}`

        if (actual_scan.length && last_scan.length) {
            console.log('Получили массивы id из последних сессий. actual scan_session: ', scan_sessions[0].id, ', last scan_session:', scan_sessions[2].id)
            for (let itemL of last_scan) {
                var isActual = actual_scan.some(function (itemA) {
                    return itemA.orsk_id == itemL.orsk_id;
                });

                if (!isActual) {
                    sold_list.push(itemL)
                }
            }
        } else {
            console.log('Снимать с публикации нечего - нет измененных объявлений')
        }
    } else {
        console.log('Либо это первая сессия для раздела, либо какая-то фигня получилась')
    }


    if (sold_list.length) {
        console.log('Объявлений для снятия:', sold_list.length, sold_list)

        // Получим МЛС-guid'ы 
        let mlsGuidList = await getMlsGuid(sold_list);
        console.log('Объявления для снятия mlsGuidList:', mlsGuidList)

        if (mlsGuidList.length) {
            // Отправим объявления в МЛС со статусом Продано
            let statusSold = await putStatusSold(mlsGuidList);
            // if (statusSold) {
            //     console.log('Выставили "продано" объявлениям: ', mlsGuidList)
            // }
        }
    } else {
        console.log('Снимать с публикации нечего - sold_list пустой')
    }

    // await sql.end();
};



