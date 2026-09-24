-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Owners Table (Users and Tenants)
CREATE TABLE public.owners (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    full_name TEXT,
    business_name TEXT,
    address TEXT,
    pincode TEXT,
    plan TEXT,
    role TEXT DEFAULT 'owner',
    allow_employee_analysis BOOLEAN DEFAULT false,
    preferred_store_name TEXT,
    preferred_logo TEXT,
    preferred_address TEXT,
    business_address TEXT,
    bill_note TEXT,
    preferred_bill_format TEXT DEFAULT '57mm',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Employee Logs
CREATE TABLE public.employee_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID REFERENCES public.owners(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    login_time TIMESTAMPTZ DEFAULT NOW(),
    logout_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Product Tabs (Categories)
CREATE TABLE public.product_tabs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Products
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    tab_id UUID REFERENCES public.product_tabs(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    hsn_number TEXT,
    price NUMERIC DEFAULT 0,
    stock INTEGER DEFAULT 0,
    is_in_house BOOLEAN DEFAULT false,
    image_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Bills (Sales)
CREATE TABLE public.bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    bill_number TEXT,
    payment_mode TEXT DEFAULT 'CASH',
    subtotal NUMERIC DEFAULT 0,
    discount_type TEXT,
    discount_value NUMERIC DEFAULT 0,
    final_amount NUMERIC DEFAULT 0,
    customer_name TEXT,
    customer_phone TEXT,
    is_undone BOOLEAN DEFAULT false,
    undo_notes TEXT,
    created_by UUID REFERENCES public.owners(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Bill Items
CREATE TABLE public.bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID REFERENCES public.bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT,
    hsn_number TEXT,
    quantity INTEGER DEFAULT 1,
    free_qty INTEGER DEFAULT 0,
    price NUMERIC DEFAULT 0,
    tenant_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS) setup for Tenant Isolation
-- (Optional but recommended for Supabase multi-tenant apps)
-- Note: You may need to adjust or enable these based on your exact app logic
/*
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_tabs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
*/

-- 7. Customers
CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    gstin TEXT,
    address TEXT,
    amount NUMERIC DEFAULT 0,
    amount_type TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Suppliers
CREATE TABLE public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    gstin TEXT,
    address TEXT,
    amount NUMERIC DEFAULT 0,
    amount_type TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Purchase Slips
CREATE TABLE public.purchase_slips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    supplier_name TEXT,
    supplier_phone TEXT,
    supplier_gstin TEXT,
    supplier_address TEXT,
    invoice_date DATE,
    invoice_number TEXT,
    entry_date DATE,
    payment_mode TEXT DEFAULT 'CASH',
    total_amount NUMERIC DEFAULT 0,
    created_by UUID REFERENCES public.owners(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Purchase Slip Items
CREATE TABLE public.purchase_slip_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_slip_id UUID REFERENCES public.purchase_slips(id) ON DELETE CASCADE,
    tenant_id TEXT NOT NULL,
    upc TEXT,
    product_name TEXT,
    hsn_number TEXT,
    bought_qty INTEGER DEFAULT 0,
    free_qty INTEGER DEFAULT 0,
    total_qty INTEGER DEFAULT 0,
    expiry_date DATE,
    bought_price NUMERIC DEFAULT 0,
    selling_price NUMERIC DEFAULT 0,
    discount NUMERIC DEFAULT 0,
    amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for Customers, Suppliers, Purchases
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_slips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_slip_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable ALL actions for users based on tenant_id" ON public.customers FOR ALL TO authenticated USING (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid())) WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid()));
CREATE POLICY "Enable ALL actions for users based on tenant_id" ON public.suppliers FOR ALL TO authenticated USING (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid())) WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid()));
CREATE POLICY "Enable ALL actions for users based on tenant_id" ON public.purchase_slips FOR ALL TO authenticated USING (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid())) WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid()));
CREATE POLICY "Enable ALL actions for users based on tenant_id" ON public.purchase_slip_items FOR ALL TO authenticated USING (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid())) WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid()));

-- 11. Ledger Transactions (Payments, Credits, Debits)
CREATE TABLE public.ledger_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id TEXT NOT NULL,
    entity_type TEXT NOT NULL, -- 'customer' or 'supplier'
    entity_id UUID NOT NULL,
    transaction_type TEXT NOT NULL, -- 'PAYMENT_RECEIVED', 'PAYMENT_GIVEN', 'ADD_CREDIT', 'ADD_DEBIT'
    amount NUMERIC DEFAULT 0,
    transaction_date DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ledger_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable ALL actions for users based on tenant_id" ON public.ledger_transactions FOR ALL TO authenticated USING (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid())) WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.owners WHERE id = auth.uid()));
