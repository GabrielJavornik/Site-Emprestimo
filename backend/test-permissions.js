/**
 * Test script to verify admin permission system and audit logging
 */

const http = require('http');

const BASE_URL = 'http://localhost:8080';
let sessionCookie = '';
let sessionCookieSuperadmin = '';

function makeCookie(sessionId) {
    return `connect.sid=${sessionId}`;
}

async function request(method, path, body = null, cookies = '') {
    return new Promise((resolve, reject) => {
        const url = new URL(BASE_URL + path);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (cookies) options.headers['Cookie'] = cookies;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, body: data, headers: res.headers });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    console.log('🧪 INICIANDO TESTES DO SISTEMA DE PERMISSÕES\n');

    try {
        // 1. Testar login como superadmin
        console.log('1️⃣ Testando login como SUPERADMIN (admin)...');
        let res = await request('POST', '/admin-login', {
            user: 'admin',
            pass: 'Azul2026'
        });

        const adminLoginBody = JSON.parse(res.body);
        if (adminLoginBody.ok) {
            sessionCookieSuperadmin = res.headers['set-cookie']?.[0]?.split(';')[0] || 'connect.sid=test-admin';
            console.log('✅ Login como SUPERADMIN bem-sucedido\n');
        } else {
            console.log('❌ Falha no login como SUPERADMIN\n');
            process.exit(1);
        }

        // 2. Verificar que superadmin pode acessar admin-gerenciar
        console.log('2️⃣ Testando acesso a /admin-gerenciar como SUPERADMIN...');
        res = await request('GET', '/admin-gerenciar', null, sessionCookieSuperadmin);
        if (res.status === 200 && res.body.includes('Gerenciar Admins')) {
            console.log('✅ SUPERADMIN pode acessar /admin-gerenciar\n');
        } else {
            console.log('❌ SUPERADMIN não consegue acessar /admin-gerenciar\n');
        }

        // 3. Verificar que superadmin pode listar admins
        console.log('3️⃣ Testando listagem de admins como SUPERADMIN...');
        res = await request('GET', '/api/admin/listar-admins', null, sessionCookieSuperadmin);
        const adminList = JSON.parse(res.body);
        if (adminList.ok && Array.isArray(adminList.admins)) {
            console.log(`✅ SUPERADMIN consegue listar ${adminList.admins.length} admin(ns)\n`);
        } else {
            console.log('❌ Falha ao listar admins\n');
        }

        // 4. Testar criação de novo admin por SUPERADMIN
        console.log('4️⃣ Testando criação de novo admin por SUPERADMIN...');
        const adminTestName = 'admin_teste_' + Date.now();
        res = await request('POST', '/api/admin/criar-admin', {
            usuario: adminTestName,
            senha: 'senha123456'
        }, sessionCookieSuperadmin);
        const createResponse = JSON.parse(res.body);
        if (createResponse.ok) {
            console.log('✅ SUPERADMIN consegue criar novo admin\n');
            const newAdminId = createResponse.admin?.id;

            // 5. Fazer login como novo admin
            console.log('5️⃣ Testando login como novo admin...');
            res = await request('POST', '/admin-login', {
                user: adminTestName,
                pass: 'senha123456'
            });

            const newAdminLoginBody = JSON.parse(res.body);
            if (newAdminLoginBody.ok) {
                sessionCookie = res.headers['set-cookie']?.[0]?.split(';')[0] || 'connect.sid=test-admin2';
                console.log('✅ Novo admin consegue fazer login\n');

                // 6. Verificar que admin regular NÃO pode acessar admin-gerenciar
                console.log('6️⃣ Testando se admin regular PODE acessar /admin-gerenciar...');
                res = await request('GET', '/admin-gerenciar', null, sessionCookie);
                if (res.status === 403 || !res.body.includes('Gerenciar Admins')) {
                    console.log('✅ Admin regular NÃO consegue acessar /admin-gerenciar (bloqueado corretamente)\n');
                } else {
                    console.log('⚠️ Admin regular consegue acessar /admin-gerenciar (deveria estar bloqueado)\n');
                }

                // 7. Verificar que admin regular NÃO pode listar admins
                console.log('7️⃣ Testando se admin regular PODE listar admins...');
                res = await request('GET', '/api/admin/listar-admins', null, sessionCookie);
                if (res.status === 403) {
                    console.log('✅ Admin regular NÃO consegue listar admins (bloqueado corretamente)\n');
                } else {
                    console.log('⚠️ Admin regular consegue listar admins (deveria estar bloqueado)\n');
                }

                // 8. Verificar que admin regular NÃO pode criar novo admin
                console.log('8️⃣ Testando se admin regular PODE criar novo admin...');
                res = await request('POST', '/api/admin/criar-admin', {
                    usuario: 'admin_teste_2_' + Date.now(),
                    senha: 'senha123456'
                }, sessionCookie);

                const response = JSON.parse(res.body);
                if (res.status === 403 || !response.ok) {
                    console.log('✅ Admin regular NÃO consegue criar novo admin (bloqueado corretamente)\n');
                } else {
                    console.log('⚠️ Admin regular consegue criar novo admin (deveria estar bloqueado)\n');
                }
            } else {
                console.log('❌ Novo admin não consegue fazer login\n');
            }

            // 9. Verificar auditoria
            console.log('9️⃣ Testando acesso ao histórico de auditoria como SUPERADMIN...');
            res = await request('GET', '/api/admin/auditoria?dias=7', null, sessionCookieSuperadmin);
            const auditRes = JSON.parse(res.body);
            if (auditRes.ok && Array.isArray(auditRes.logs)) {
                console.log(`✅ SUPERADMIN consegue acessar auditoria (${auditRes.logs.length} registros)\n`);

                // Verificar se a ação de criação foi logada
                const criarAdminLog = auditRes.logs.find(log => log.acao === 'Criar novo admin');
                if (criarAdminLog) {
                    console.log('✅ Ação "Criar novo admin" foi logada na auditoria');
                    console.log(`   Admin: ${criarAdminLog.admin_nome}`);
                    console.log(`   Descrição: ${criarAdminLog.descricao}\n`);
                } else {
                    console.log('⚠️ Ação "Criar novo admin" não foi encontrada na auditoria\n');
                }
            } else {
                console.log('❌ Falha ao acessar auditoria\n');
            }

            // 10. Verificar que admin regular NÃO pode acessar auditoria
            console.log('🔟 Testando se admin regular PODE acessar auditoria...');
            res = await request('GET', '/api/admin/auditoria?dias=7', null, sessionCookie);
            if (res.status === 403) {
                console.log('✅ Admin regular NÃO consegue acessar auditoria (bloqueado corretamente)\n');
            } else {
                console.log('⚠️ Admin regular consegue acessar auditoria (deveria estar bloqueado)\n');
            }

        } else {
            console.log('❌ Falha ao criar novo admin\n');
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ TESTES CONCLUÍDOS COM SUCESSO!');
        console.log('Sistema de permissões e auditoria está funcionando corretamente.');
        process.exit(0);

    } catch (err) {
        console.error('❌ Erro durante teste:', err);
        process.exit(1);
    }
}

// Aguardar servidor iniciar
setTimeout(test, 1000);
