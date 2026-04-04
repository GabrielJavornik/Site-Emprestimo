DROP TABLE IF EXISTS USUARIOS CASCADE;
CREATE TABLE USUARIOS (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(11) UNIQUE NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    whatsapp VARCHAR(20),
    senha VARCHAR(255) NOT NULL,
    email_verificado BOOLEAN DEFAULT FALSE,
    token_email VARCHAR(255),
    reset_token VARCHAR(255),
    reset_expira TIMESTAMP,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
DROP TABLE IF EXISTS SIMULACOES CASCADE;
CREATE TABLE SIMULACOES (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf VARCHAR(11) NOT NULL,
    email VARCHAR(150),
    whatsapp VARCHAR(20),
    valor DECIMAL(10, 2) NOT NULL,
    parcelas INT NOT NULL,
    valor_parcela DECIMAL(10, 2),
    total DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'EM ANÁLISE',
    documento_path VARCHAR(255),
    renda_path VARCHAR(255),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cpf) REFERENCES USUARIOS(cpf)
);
DROP TABLE IF EXISTS PAGAMENTOS CASCADE;
CREATE TABLE PAGAMENTOS (
    id SERIAL PRIMARY KEY,
    simulacao_id INT NOT NULL,
    data_pagamento DATE NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'CONFIRMADO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (simulacao_id) REFERENCES SIMULACOES(id) ON DELETE CASCADE
);
CREATE INDEX idx_usuarios_cpf ON USUARIOS(cpf);
CREATE INDEX idx_usuarios_email ON USUARIOS(email);
CREATE INDEX idx_simulacoes_cpf ON SIMULACOES(cpf);
CREATE INDEX idx_simulacoes_status ON SIMULACOES(status);
CREATE INDEX idx_pagamentos_simulacao_id ON PAGAMENTOS(simulacao_id);
INSERT INTO USUARIOS (
        nome,
        cpf,
        email,
        whatsapp,
        senha,
        email_verificado
    )
VALUES (
        'Usuário Teste',
        '12345678901',
        'teste@example.com',
        '5554992026684',
        'teste123',
        true
    ) ON CONFLICT (cpf) DO NOTHING;