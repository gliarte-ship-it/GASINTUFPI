import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ isConfigured: false, error: 'No authorization header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Create a regular client to verify the user token
    const supabaseUser = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ isConfigured: false, error: 'Invalid session' }, { status: 401 });
    }

    // Key check
    const isConfigured = !!serviceRoleKey;

    return NextResponse.json({ 
      isConfigured,
      message: isConfigured 
        ? 'Configuração administrativa completa.' 
        : 'SUPABASE_SERVICE_ROLE_KEY não encontrada. Algumas funções administrativas (excluir usuário, alterar senha) estão desativadas.'
    });

  } catch (error: any) {
    return NextResponse.json({ isConfigured: false, error: error.message }, { status: 500 });
  }
}
