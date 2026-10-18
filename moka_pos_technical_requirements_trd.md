# Technical Requirements Document (TRD) - Moka-POS

## 1. Technology Stack
* **Frontend:** Next.js (App Router), React, Tailwind CSS, Shadcn UI.
* **State Management:** Zustand (Client-side cart logic).
* **Backend:** Node.js, Express.js.
* **Database:** MongoDB with Mongoose ORM.
* **Language:** TypeScript (Strict mode enabled across the entire monorepo).

## 2. System Architecture
The system follows a standard client-server architecture with a RESTful API connecting the Next.js frontend to the Express.js backend.

## 3. Database Schema (MongoDB / Mongoose)

### 3.1 Users
* `_id`: ObjectId
* `name`: String
* `email`: String (Unique)
* `password`: String (Hashed)
* `role`: Enum ['admin', 'kasir']

### 3.2 Products
* `_id`: ObjectId
* `name`: String
* `sku`: String (Unique)
* `price`: Number
* `category`: String
* `stockQuantity`: Number
* `imageUrl`: String (Optional)

### 3.3 Transactions
* `_id`: ObjectId
* `transactionNumber`: String (Unique, Auto-generated)
* `cashierId`: ObjectId (Ref: Users)
* `items`: Array of Objects `{ productId, name, quantity, unitPrice, subtotal }`
* `subtotal`: Number
* `tax`: Number
* `totalAmount`: Number
* `paymentMethod`: Enum ['cash', 'qris', 'card']
* `createdAt`: Date

### 3.4 Stock History
* `_id`: ObjectId
* `productId`: ObjectId (Ref: Products)
* `type`: Enum ['IN', 'OUT', 'SALE']
* `quantityChange`: Number
* `note`: String
* `createdAt`: Date

## 4. API Endpoints (Express.js)

### 4.1 Auth
* `POST /api/auth/login`: Authenticates user and returns JWT.

### 4.2 Products
* `GET /api/products`: Fetch all products (Used by POS Grid).
* `POST /api/products`: Create a new product (Admin).
* `PUT /api/products/:id`: Update product (Admin).
* `DELETE /api/products/:id`: Delete product (Admin).

### 4.3 Transactions & Checkout
* `POST /api/transactions`: 
  * Accepts cart items and payment details.
  * Creates a new Transaction document.
  * **Middleware:** Automatically decrements `stockQuantity` in the Product collection.
  * **Middleware:** Automatically inserts 'SALE' records into the Stock History collection.

### 4.4 Inventory
* `POST /api/inventory/adjust`: Manually adjust stock (IN/OUT) and log history.
* `GET /api/inventory/history`: Fetch stock movement logs.

### 4.5 Reports
* `GET /api/reports/sales`: Returns aggregated sales data (Daily, Monthly, Top Sellers).