<div align="center">

# ☕ MOKA CAFE

### A smarter way to run a café.

**An integrated Point of Sale and café management platform built to bring daily operations into one reliable system.**

[Project Vision](#-project-vision) · [Features](#-what-moka-cafe-brings-together) · [Technology](#-technology-stack) · [Quality & Security](#-quality-and-security) · [Documentation](#-documentation)

<br />

![Status](https://img.shields.io/badge/status-active%20development-2f855a)
![Frontend](https://img.shields.io/badge/frontend-Next.js%2016-black)
![Backend](https://img.shields.io/badge/backend-Express%205-444444)
![Database](https://img.shields.io/badge/database-MongoDB-47A248)

</div>

---

## 🎯 Project vision

MOKA CAFE is being developed to make café operations more organized, accurate, and easier to manage.

A café does more than sell coffee. Every day, it handles orders, payments, products, ingredients, stock movements, staff shifts, and business reports. When these activities are managed separately, it becomes harder to maintain accurate information and understand what is happening across the business.

**MOKA CAFE aims to connect these activities through one centralized platform.**

The goal is not simply to record sales. It is to help café teams manage daily work with greater consistency, give administrators better operational visibility, and provide a foundation for informed business decisions.

## 💡 Why this project exists

MOKA CAFE is built around a few practical challenges:

- **Disconnected operations** — sales, stock, and reporting need to work together rather than operate as isolated tasks.
- **Inventory visibility** — product and ingredient movements should be traceable and easier to review.
- **Transaction accuracy** — checkout must handle totals, payments, and retries consistently.
- **Operational control** — user roles and cashier shifts help organize who can perform and manage activities.
- **Business visibility** — clear sales information helps the team understand performance over time.

## 🚀 What MOKA CAFE brings together

| Area | Purpose |
|---|---|
| Point of Sale | Manage product selection, cart totals, and customer orders. |
| Checkout & Payments | Process sales with server-side validation and safe retry handling. |
| Product Management | Maintain the product catalogue and product status. |
| Recipe Management | Connect recipe-based products with ingredient quantities. |
| Inventory & Stock | Track direct-product stock, ingredient usage, adjustments, and stock movements. |
| Cashier Shifts | Manage open and closed shifts and associate sales with the active shift. |
| Users & Access | Support role-aware access and account administration. |
| Sales & Reports | Review transactions, filter sales information, and view business summaries. |
| Store Configuration | Centralize settings such as tax rate and store timezone. |

> Features and workflows continue to evolve during development. Refer to the product documentation for the current functional specification.

## 🧭 Product principles

MOKA CAFE is being developed with these principles in mind:

1. **Accuracy first** — totals, stock changes, and transactions should be validated consistently.
2. **Traceability** — important stock and sales activities should leave a useful record.
3. **Security by design** — authentication, session handling, access control, and production configuration matter.
4. **Operational simplicity** — common café tasks should be clear and straightforward for the people using the system.
5. **Reliable information** — reports should be based on consistent data and clearly defined time periods.

## 🛠️ Technology stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 |
| Language | TypeScript |
| Backend API | Express 5 |
| Database | MongoDB |
| Frontend testing | Vitest and project smoke tests |
| Backend testing | Unit tests and end-to-end tests |
| Runtime | Node.js |

The application is organized as two main projects:

```text
moka-pos/
├── frontend/       # Next.js application
│   └── docs/       # Product, technical, API and testing documentation
├── backend/        # Express API and MongoDB integration
│   └── docs/       # Backend architecture documentation
└── .github/        # CI and scheduled smoke-test workflows
```

## 🔐 Quality and security

Reliability is part of the product, not an afterthought. Recent engineering work has focused on:

- Session revocation after logout, password changes, administrative password resets, and account activation changes.
- Password policy enforcement and login/password-change rate limiting.
- Production configuration checks for secure cookies, session secrets, and CORS.
- Checkout idempotency to reduce duplicate-sale risk when a request is retried.
- Server-side validation for orders, stock movements, and report date ranges.
- Response security headers and cache-control protections.

### Latest recorded verification

The following results were recorded in the engineering handoff on **2 November 2026**:

| Check | Recorded result |
|---|---:|
| Backend unit tests | 19 / 19 passed |
| Backend end-to-end tests | 292 / 292 passed |
| Frontend unit tests | 30 / 30 passed |
| Frontend production build | Passed |
| Frontend full-stack smoke tests | 194 / 194 passed |
| Production dependency audit | 0 production vulnerabilities reported |

These are results from the recorded verification run, not a guarantee that every later change has been tested. Run the checks again against the current working tree before release.

## 💻 Development

### Prerequisites

- Node.js `v24.20.0` (version used for the recorded verification)
- npm `11.19.0`
- MongoDB or the configured test database workflow

### Project setup

The frontend and backend are separate npm projects. Install dependencies from each project directory:

```bash
cd backend
npm install

cd ../frontend
npm install
```

Configure each application using its environment example files before starting local development. See the frontend and backend documentation for the required variables and available scripts.

### Useful verification commands

Run these from the relevant project directory.

**Backend**

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

**Frontend**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:ci
```

`smoke:ci` runs the frontend's full-stack CI smoke workflow. Refer to the testing documentation for its setup and execution details.

## 📚 Documentation

For implementation details and current requirements, see:

- `frontend/docs/PRD.md` — product requirements.
- `frontend/docs/TRD.md` — technical requirements.
- `frontend/docs/API-CONTRACT.md` — frontend/backend API contract.
- `frontend/docs/TESTING.md` — testing strategy and commands.
- `frontend/docs/DESIGN.md` — interface and design documentation.
- `backend/docs/ARCHITECTURE.md` — backend architecture and engineering invariants.
- `frontend/README.md` and `backend/README.md` — project-specific instructions.

## 🗺️ Development direction

MOKA CAFE is an evolving project. Its development is guided by a simple direction:

- Make everyday café transactions dependable.
- Keep product, recipe, and inventory information connected.
- Improve operational visibility through useful reports.
- Maintain secure access and reliable data handling.
- Continue improving usability for café staff and administrators.

The detailed implementation status and outstanding engineering tasks should be maintained in the project's engineering handoff and technical documentation.

## 🤝 Project philosophy

**Build with purpose. Keep operations simple. Make information reliable.**

MOKA CAFE is a practical software project focused on solving real operational needs through thoughtful engineering. Every improvement should make the system more useful, more dependable, or easier to operate.

---

<div align="center">

**MOKA CAFE**  
*Designed to bring café operations together.*

</div>
