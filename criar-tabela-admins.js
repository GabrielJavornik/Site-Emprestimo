require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'site_emprestimo',
    password: 'Chaves60.',
    port: 5432
});

async function criarTabelaAdmins() {
    try {
        console.log('🔄 Conectando ao banco de dados...');

        // 1. Criar tabela ADMINS
        await pool.query(`
            DROP TABLE IF EXISTS ADMINS CASCADE;
            CREATE TABLE ADMINS (
                id SERIAL PRIMARY KEY,
                usuario VARCHAR(50) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                nome VARCHAR(150),
                email VARCHAR(150),
                ativo BOOLEAN DEFAULT TRUE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Tabela ADMINS criada');

        // 2. Inserir admin padrão
        await pool.query(`
            INSERT INTO ADMINS (usuario, senha, nome, email, ativo)
            VALUES ('admin', 'Azul2026', 'Administrador', 'admin@example.com', true)
            ON CONFLICT (usuario) DO NOTHING;
        `);
        console.log('✅ Admin padrão criado');

        // 3. Criar índices
        await pool.query(`
            CREATE INDEX idx_admins_usuario ON ADMINS(usuario);
            CREATE INDEX idx_admins_ativo ON ADMINS(ativo);
        `);
        console.log('✅ Índices criados');

        // 4. Verificar dados
        const result = await pool.query('SELECT id, usuario, nome, ativo FROM ADMINS');
        console.log('\n📋 Admins criados:');
        console.table(result.rows);

        console.log('\n✅ Tabela ADMINS pronta para usar!');
    } catch (err) {
        console.error('❌ Erro:', err.message);
    } finally {
        await pool.end();
    }
}

criarTabelaAdmins();
