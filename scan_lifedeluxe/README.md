### Настройка среды 
1. Установить deno
   https://deno.land/#installation
2. Установить PostgreSQL
   https://www.postgresql.org/download/
3. Завести БД
4. Создать таблицы и функции
   `/deno/scan_lifedeluxe/db.sql`

### Запуск сканера 
alpha - `config=alpha deno run -A scan.js` <br>
stable - `config=stable deno run -A scan.js`
