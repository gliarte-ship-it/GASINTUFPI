-- 1. Setup User Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('SUPER_ADMIN', 'DIRECTOR', 'STAFF');
    END IF;
END$$;

-- 2. Create or Update Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role user_role DEFAULT 'STAFF',
    is_authorized BOOLEAN DEFAULT FALSE,
    level TEXT DEFAULT 'Funcionário',
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist in case the table already existed without them
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_authorized') THEN
        ALTER TABLE public.profiles ADD COLUMN is_authorized BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='level') THEN
        ALTER TABLE public.profiles ADD COLUMN level TEXT DEFAULT 'Funcionário';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='avatar_url') THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;
    END IF;
END$$;

-- 3. Create Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Sem título',
    description TEXT,
    status TEXT DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure columns exist in case the table already existed with different structure
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reports' AND column_name='user_id') THEN
        ALTER TABLE public.reports ADD COLUMN user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reports' AND column_name='title') THEN
        ALTER TABLE public.reports ADD COLUMN title TEXT NOT NULL DEFAULT 'Sem título';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reports' AND column_name='description') THEN
        ALTER TABLE public.reports ADD COLUMN description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reports' AND column_name='status') THEN
        ALTER TABLE public.reports ADD COLUMN status TEXT DEFAULT 'PENDING';
    END IF;
END$$;

-- 4. Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 5. Basic RLS Policies
-- Helper function to check if user is admin/director
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'DIRECTOR')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is authorized
CREATE OR REPLACE FUNCTION public.is_authorized()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_authorized = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any profile" ON public.profiles;
CREATE POLICY "Admins can delete any profile" ON public.profiles FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Reports
DROP POLICY IF EXISTS "Users can manage own reports" ON public.reports;
CREATE POLICY "Users can manage own reports" ON public.reports FOR ALL USING (auth.uid() = user_id AND public.is_authorized());

DROP POLICY IF EXISTS "Personnel can see all reports" ON public.reports;
CREATE POLICY "Personnel can see all reports" ON public.reports FOR SELECT USING (public.is_authorized());

DROP POLICY IF EXISTS "Admins can manage all reports" ON public.reports;
CREATE POLICY "Admins can manage all reports" ON public.reports FOR ALL USING (public.is_admin());

-- 6. Create Associates Table (Missing in previous version)
CREATE TABLE IF NOT EXISTS public.associates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID REFERENCES public.reports(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value NUMERIC(15, 2) NOT NULL,
    siape TEXT,
    siape2 TEXT,
    cpf TEXT,
    contract TEXT,
    pensionista BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table for "PARA PRÓXIMA FOLHA"
CREATE TABLE IF NOT EXISTS public.next_payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf TEXT NOT NULL,
    name TEXT NOT NULL,
    occurrence TEXT NOT NULL CHECK (occurrence IN ('INCLUSÃO', 'EXCLUSÃO')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.next_payroll_records ENABLE ROW LEVEL SECURITY;

-- Everyone can read
DROP POLICY IF EXISTS "Everyone can read next payroll" ON public.next_payroll_records;
CREATE POLICY "Everyone can read next payroll" ON public.next_payroll_records
    FOR SELECT USING (true);

-- Only super-admins can insert/delete
DROP POLICY IF EXISTS "Super-admins can manage next payroll" ON public.next_payroll_records;
CREATE POLICY "Super-admins can manage next payroll" ON public.next_payroll_records
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
        )
    );

-- Ensure columns exist if table was already created
ALTER TABLE public.associates ADD COLUMN IF NOT EXISTS siape2 TEXT;
ALTER TABLE public.associates ADD COLUMN IF NOT EXISTS contract TEXT;

ALTER TABLE public.associates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Personnel can see all associates" ON public.associates;
CREATE POLICY "Personnel can see all associates" ON public.associates FOR SELECT USING (public.is_authorized());

DROP POLICY IF EXISTS "Personnel can manage associates" ON public.associates;
CREATE POLICY "Personnel can manage associates" ON public.associates FOR ALL USING (public.is_authorized());

-- 8. Storage Setup (Optional, may fail if storage schema not present)
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('avatars', 'avatars', true)
    ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
    -- Ignore if storage schema doesn't exist
END $$;

-- 9. Storage RLS (Optional)
DO $$
BEGIN
    -- Allow public access to avatars
    CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
    CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN
    -- Ignore if storage schema doesn't exist
END $$;
-- This function automatically creates a profile when someone signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  meta_name TEXT;
  meta_level TEXT;
  target_role_text TEXT;
  target_authorized BOOLEAN;
BEGIN
  -- 1. Extract metadata safely (handles different metadata keys)
  meta_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Usuário');
  meta_level := COALESCE(NEW.raw_user_meta_data->>'level', 'Funcionário');
  
  -- 2. Determine default permissions
  IF NEW.email = 'gliarte@gmail.com' THEN
    target_role_text := 'SUPER_ADMIN';
    target_authorized := TRUE;
  ELSIF meta_level = 'Diretoria' THEN
    target_role_text := 'DIRECTOR';
    target_authorized := FALSE;
  ELSE
    target_role_text := 'STAFF';
    target_authorized := FALSE;
  END IF;

  -- 3. Handle existing profiles to avoid UNIQUE constraints conflicts
  DELETE FROM public.profiles WHERE email = NEW.email AND id != NEW.id;

  -- 4. Insert or Update the profile
  BEGIN
    INSERT INTO public.profiles (id, email, name, role, is_authorized, level)
    VALUES (
      NEW.id,
      NEW.email,
      meta_name,
      target_role_text::user_role,
      target_authorized,
      meta_level
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      is_authorized = EXCLUDED.is_authorized,
      level = EXCLUDED.level,
      updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to return NEW even if insertion fails
    RETURN NEW;
  END;
    
  RETURN NEW;
END;
$$;

-- 10. System Logs Table
CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT,
    action TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Everyone can insert logs (for recording actions)
DROP POLICY IF EXISTS "Anyone can insert logs" ON public.system_logs;
CREATE POLICY "Anyone can insert logs" ON public.system_logs
    FOR INSERT WITH CHECK (true);

-- Only super-admins can read logs
DROP POLICY IF EXISTS "Super-admins can read logs" ON public.system_logs;
CREATE POLICY "Super-admins can read logs" ON public.system_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
        )
    );

-- Re-attach trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
