import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'Missing userId or newPassword' }, { status: 400 });
    }

    // Get the requester token from headers
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' }, { status: 500 });
    }

    // Create a regular client to verify the user token
    const supabaseUser = createClient(supabaseUrl, anonKey);
    const { data: { user: requesterUser }, error: authError } = await supabaseUser.auth.getUser(token);

    if (authError || !requesterUser) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }

    // Create admin client
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify requester is a SUPER_ADMIN
    const { data: requesterProfile, error: requesterError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requesterUser.id)
      .single();

    if (requesterError || !requesterProfile || requesterProfile.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized. Only Super Admins can update other users passwords.' }, { status: 403 });
    }

    // Update password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (updateError) {
      console.error('Error updating password:', updateError);
      return NextResponse.json({ error: `Failed to update password: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' });

  } catch (error: any) {
    console.error('Unexpected error in update-password API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
