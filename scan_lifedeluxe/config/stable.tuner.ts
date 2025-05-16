import Tuner from 'https://deno.land/x/tuner@v0.1.4/mod.ts';

export default Tuner.tune(
    {
        config: {
            db: 'postgres://test_cian:123@localhost:5432/test_cian',
            dip_amqp: 'amqp://alpha-dip:jaGCSFdc@alpha-dip-queue0.baza-winner.ru',
            mls_elastic: 'http://elastic:voQBgdbC3@v9z.ru:63280/',
            mls_sold: 'http://alpha-mls.baza-winner.ru/v1/advs.json?deal_status_sold=1',
            mls_access_token: 'gG1didS31noo1nKIGaUdOFW49ALXib4IdtJ7gtt2Hpp4yotTVpWDRQM4fHF3FTxC',
        },
    },
);