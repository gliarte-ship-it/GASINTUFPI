import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId, requesterId } = await req.json();

    if (!userId || !requesterId) {
      return NextResponse.json({ error: 'Missing userId or requesterId' }, { status: 400 });
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

    // 1. Verify requester is a SUPER_ADMIN
    const { data: requesterProfile, error: requesterError } = await supabaseAdmin
      .from('profiles')
      .select('role, email')
      .eq('id', requesterUser.id)
      .single();

    if (requesterError || !requesterProfile || requesterProfile.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized. Only Super Admins can delete users.' }, { status: 403 });
    }

    // 2. Get target user email to check protection
    const { data: targetUser, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (targetError) {
       // Maybe profile exists but user doesn't or vice versa. 
       // In case auth user doesn't exist, we still want to try deleting the profile.
       console.warn('Auth user not found during deletion attempt:', targetError.message);
    }

    const targetEmail = targetUser?.user?.email;

    // Protection rule: gliarte@gmail.com cannot be deleted by anyone but themselves (though usually we don't delete self here)
    // Actually, simple rule: gliarte@gmail.com is IMMUTABLE/UNDELETABLE via this API for safety.
    if (targetEmail === 'gliarte@gmail.com') {
      return NextResponse.json({ error: 'Protected user cannot be deleted.' }, { status: 403 });
    }

    // 3. Delete from public.profiles first (to avoid RLS issues if auth user gone)
    const { error: profileDeleteError } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileDeleteError) {
      console.error('Error deleting profile:', profileDeleteError);
      // Continue anyway or return? Usually better to try deleting auth user too if profile failed for some reason
    }

    // 4. Delete from auth.users
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      return NextResponse.json({ error: `Failed to delete Supabase Auth user: ${authDeleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'User deleted from Auth and Database' });

  } catch (error: any) {
    console.error('Unexpected error in delete-user API:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
