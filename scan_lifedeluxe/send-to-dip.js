import Tuner from "https://deno.land/x/tuner@v0.1.4/mod.ts";
export const tuner = await Tuner.use.loadConfig();

import amqp from "npm:amqplib@0.8.0";
import { Buffer } from 'node:buffer';

export async function SendToDip(message) {
    try {
        const conn = await amqp.connect(tuner.config.dip_amqp);
        const ch = await conn.createChannel();
        const queue = 'process-source-wcrawler';

        // Отправка сообщения в очередь
        let bufferMessage = Buffer.from(JSON.stringify(message));

        await ch.sendToQueue(queue, bufferMessage, { persistent: true });
        console.log('SEND card to dip')
        console.log(' ')
        // console.log(`Message sent to queue: ${JSON.stringify(message)}`);

        setTimeout(() => {
            conn.close();
        }, 500);
    } catch (error) {
        console.log('ошибка', error);
    }
};
