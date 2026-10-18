# Product Requirements Document (PRD) - Moka-POS

## 1. Product Overview
**Name:** Moka-POS
**Description:** A premium, dark-themed Point of Sale (POS) system designed specifically for artisan coffee shops and roasteries. It streamlines sales transactions, inventory tracking, and business reporting through a tablet-optimized web interface.

## 2. Target Audience & User Roles
* **Cashier (Kasir):** Floor staff who process customer orders, handle payments, and print receipts. They require a fast, intuitive, and distraction-free interface.
* **Administrator (Admin):** Store managers or owners who oversee operations. They need full access to manage products, adjust inventory, view financial reports, and manage staff accounts.

## 3. Core Features & Workflows
Based on the system architecture, Moka-POS includes five core modules accessed via the Main Dashboard:

### 3.1 Authentication
* Secure login screen featuring the Moka-POS gold/black avatar.
* Role-based access control routing users to their authorized views.

### 3.2 Sales Transaction (Transaksi Penjualan)
* **Product Grid:** Visual layout of menu items (Drinks, Snacks, Retail) with search functionality.
* **Active Cart:** Real-time calculation of item quantities, subtotals, and 10% tax.
* **Checkout & Payment:** Selection of payment methods (Cash, QRIS, Card).
* **Automation:** Automatic deduction of stock upon successful payment.
* **Receipts:** Generation of digital or printable thermal receipts.

### 3.3 Product Management (Manajemen Produk)
* CRUD operations: Add, Edit, and Delete products.
* Categorization (e.g., Coffee, Non-Coffee, Pastries, Merchandise).
* Pricing and initial stock setup.

### 3.4 Stock Management (Manajemen Stok)
* **Stock In:** Logging new deliveries or roasted batches.
* **Stock Out:** Logging waste, expired items, or staff usage.
* **Stock History:** Comprehensive audit trail of all inventory changes.

### 3.5 Reports (Laporan)
* Daily and Monthly sales summaries.
* Identification of Top-Selling Products.
* Total revenue tracking.

### 3.6 User Management (Manajemen Pengguna)
* Admin ability to create, edit, or remove Cashier and Admin accounts.

## 4. UI/UX Requirements
* **Theme:** Dark mode by default with premium gold accents (#f3d08c).
* **Responsiveness:** Optimized for tablet landscape mode (standard POS hardware) but responsive down to mobile.
* **Component Library:** Shadcn UI for consistent, accessible, and highly customizable interface elements.