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
    quantity INTEGER DEFAULT 1,
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
