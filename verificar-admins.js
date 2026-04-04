require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'site_emprestimo',
    password: 'Chaves60.',
    port: 5432
});

async function verificar() {
    try {
        const result = await pool.query('SELECT id, usuario, senha, nome, ativo FROM ADMINS');
        console.log('\n📋 Admins no banco:');
        console.table(result.rows);
        
        console.log('\n🔍 Testando login do Admin2 com a senha que vê aqui...');
        const admin2 = result.rows.find(a => a.usuario === 'Admin2');
        if (admin2) {
            console.log('  Usuário: Admin2');
            console.log('  Senha no banco: ' + admin2.senha);
            console.log('  Ativo: ' + admin2.ativo);
        }
        
        await pool.end();
    } catch (err) {
        console.error('❌ Erro:', err.message);
    }
}

verificar();
