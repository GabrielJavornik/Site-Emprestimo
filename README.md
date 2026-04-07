# AzulCrédito - Loan Management System

A complete loan and credit score management system built with Node.js and PostgreSQL.

## 📁 Project Structure

```
Site-Emprestimo/
├── backend/                 # Backend server & business logic
│   ├── server.js           # Main Express server (~5900 lines)
│   ├── package.json        # Node.js dependencies
│   ├── package-lock.json   # Locked dependency versions
│   ├── .env                # Environment variables
│   ├── setup-banco.sql     # Database initialization script
│   ├── test-permissions.js # Permission system tests
│   ├── node_modules/       # Installed dependencies
│   └── uploads/            # User document uploads
│
├── frontend/               # Client-side application
│   ├── index.html         # Main HTML template
│   ├── style.css          # Styling (10KB)
│   └── script.js          # Client-side logic (15KB)
│
└── README.md              # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- PostgreSQL 12+
- npm or yarn

### Installation

1. **Install dependencies**
```bash
cd backend
npm install
```

2. **Configure environment**
```bash
# Update .env with your database credentials
nano .env
```

3. **Initialize database**
```bash
# Import the SQL schema
psql -U postgres -d site_emprestimo -f setup-banco.sql
```

4. **Start the server**
```bash
# From backend folder
npm start
# Server runs on http://localhost:3000
```

## 🔑 Key Features

- **Admin Management System**
  - Role-based access (superadmin vs regular admin)
  - Audit logging for all admin actions
  - Permission-based UI restrictions

- **Credit Score System**
  - Automatic score calculation (300-900 range)
  - Payment history tracking
  - Score-based credit limits
  - Six tier levels with different limits

- **Loan Management**
  - Proposal submission and approval
  - Installment tracking
  - Payment management
  - Late payment detection

- **Security Features**
  - Session-based authentication
  - Dual-layer permission validation (frontend + backend)
  - Encrypted sensitive data
  - Comprehensive audit trail

## 👥 User Roles

### Regular User
- View personal profile and credit score
- Submit loan proposals
- Track payment schedule
- Make installment payments

### Regular Admin
- View all loan proposals
- Approve/reject proposals
- Process payments
- View client list

### Superadmin
- All admin features
- Manage other admins
- Configure interest rates
- Clear test data
- Full audit access

## 📊 Database

The system uses PostgreSQL with tables for:
- Users (USUARIOS)
- Loan Proposals (SIMULACOES)
- Payments (PAGAMENTOS)
- Fines (MULTAS)
- Admin Audit Log (AUDITORIA)

## 🛠️ Development

### File Changes
When modifying files, note the new structure:
- Backend changes: `backend/server.js`
- Frontend changes: `frontend/index.html`, `style.css`, `script.js`

### Testing
```bash
cd backend
node test-permissions.js
```

## 📝 Notes

- All timestamps use UTC
- Currency is Brazilian Real (R$)
- Interest rates use decimal format (0.05 = 5%)
- Phone numbers must include country code (55)

---

**Last Updated:** 2026-04-06
