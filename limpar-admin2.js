const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'site_emprestimo',
    password: 'Chaves60.',
    port: 5432
});

async function limpar() {
    try {
        // Deletar Admin2
        await pool.query('DELETE FROM ADMINS WHERE usuario = $1', ['Admin2']);
        console.log('✅ Admin2 deletado');
        
        // Listar admins
        const result = await pool.query('SELECT usuario, senha FROM ADMINS');
        console.log('\n📋 Admins restantes:');
        console.table(result.rows);
        
        await pool.end();
    } catch (err) {
        console.error('❌ Erro:', err.message);
    }
}

limpar();
