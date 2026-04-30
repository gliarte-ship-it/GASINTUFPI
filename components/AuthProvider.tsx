'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Session } from '@supabase/supabase-js';

export type UserRole = 'SUPER_ADMIN' | 'DIRECTOR' | 'STAFF';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_authorized: boolean;
  level: string;
  avatar_url?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isSigningIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, pass: string) => Promise<void>;
  signUpWithEmail: (email: string, pass: string, name: string, level: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isSuperAdmin: boolean;
  isDirector: boolean;
  isStaff: boolean;
  isAuthorized: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);

  async function handleAuthChange(session: Session | null) {
    const newUser = session?.user ?? null;
    setUser(newUser);
    
    if (newUser) {
      // Fetch profile
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', newUser.id)
        .single();
      
      if (data) {
        // Force SUPER_ADMIN for gliarte if it's not set in DB yet
        if (newUser.email === 'gliarte@gmail.com' && (data.role !== 'SUPER_ADMIN' || !data.is_authorized)) {
          await supabase.from('profiles').update({ role: 'SUPER_ADMIN', is_authorized: true }).eq('id', newUser.id);
          data.role = 'SUPER_ADMIN';
          data.is_authorized = true;
        }
        setProfile(data as UserProfile);
      } else if (newUser.email === 'gliarte@gmail.com') {
        // Auto-create for gliarte
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: newUser.id,
            email: newUser.email,
            name: newUser.user_metadata?.full_name || 'Super User',
            role: 'SUPER_ADMIN',
            is_authorized: true,
            level: 'Diretoria'
          })
          .select()
          .single();
        
        if (newProfile) setProfile(newProfile as UserProfile);
      } else {
        setProfile(null);
      }
    } else {
      setProfile(null);
    }
    
    setLoading(false);
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        console.error('Erro ao obter sessão inicial:', error.message);
        if (error.message.includes('Refresh Token Not Found')) {
          console.warn('Token de atualização expirado ou inválido. Limpando sessão...');
          supabase.auth.signOut().then(() => {
            handleAuthChange(null);
          });
          return;
        }
      }
      handleAuthChange(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
    } catch (error: any) {
      console.error('Sign-in error:', error);
      alert('Erro ao entrar com Google: ' + error.message);
    } finally {
      setIsSigningIn(false);
    }
  };

  const signInWithEmail = async (email: string, pass: string) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    } catch (error: any) {
      console.error('Email sign-in error:', error);
      if (error.message === 'Failed to fetch') {
        throw new Error('Erro de conexão. Verifique se as variáveis de ambiente do Supabase estão configuradas nas configurações do projeto.');
      }
      if (error.message?.includes('Email not confirmed')) {
        throw new Error('E-mail ainda não confirmado. Verifique sua caixa de entrada ou desative "Confirm Email" em seu painel do Supabase (Authentication -> Settings).');
      }
      if (error.message?.includes('Invalid login credentials')) {
        throw new Error('Usuário ou senha inválidos. Verifique se digitou corretamente ou se já confirmou seu e-mail (caso tenha acabado de se cadastrar).');
      }
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const signUpWithEmail = async (email: string, pass: string, name: string, level: string) => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data: { full_name: name, level: level }
        }
      });
      
      if (error) {
        console.error('Auth.signUp error:', error);
        if (error.message.includes('Database error saving new user')) {
          throw new Error('Erro de banco de dados no Supabase: O gatilho "handle_new_user" falhou. Isso acontece porque suas tabelas SQL estão desatualizadas ou o gatilho está tentando acessar uma coluna que não existe. SOLUÇÃO: No Supabase, clique em "SQL Editor", abra uma "New Query", copie TODO o código de "supabase_migration.sql" do projeto e clique em "Run". Isso também corrigirá problemas de autorização de usuários.');
        }
        throw error;
      }
      
      if (data.user) {
        // If email confirmation is on, session will be null
        if (!data.session) {
          // Signup successful but needs email confirmation
          return;
        }

        // Check if profile exists (might have been created by trigger)
        const { data: existing, error: fetchError } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();
          
        // Prepare profile data
        const profileData = {
          id: data.user.id,
          email: email,
          name: name,
          level: level,
          role: email === 'gliarte@gmail.com' ? 'SUPER_ADMIN' : (level === 'Diretoria' ? 'DIRECTOR' : 'STAFF'),
          is_authorized: email === 'gliarte@gmail.com' ? true : false
        };

        // If fetch failed or no profile, try to upsert
        // We use upsert as a safety measure in case the trigger failed or hasn't finished
        const { error: upsertError } = await supabase
          .from('profiles')
          .upsert(profileData);

        if (upsertError) {
          console.error('Profile upsert error:', upsertError);
          // If it's a "column not found" error, the user likely needs to run migrations
          if (upsertError.message.includes('column') || upsertError.code === '42703') {
             throw new Error('Erro no banco de dados: Colunas "level" ou "is_authorized" não encontradas. Por favor, execute as migrações SQL no painel do Supabase.');
          }
          throw new Error('Erro ao salvar perfil do usuário: ' + upsertError.message);
        }
      }
    } catch (error: any) {
      console.error('Detailed Signup error:', error);
      throw error;
    } finally {
      setIsSigningIn(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (data) {
      setProfile(data as UserProfile);
    }
  };

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN' || user?.email === 'gliarte@gmail.com';
  const isDirector = isSuperAdmin || profile?.role === 'DIRECTOR';
  const isStaff = isDirector || profile?.role === 'STAFF';
  const isAuthorized = !!profile?.is_authorized || user?.email === 'gliarte@gmail.com';

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      isSigningIn, 
      signInWithGoogle, 
      signInWithEmail, 
      signUpWithEmail,
      logout,
      refreshProfile,
      isSuperAdmin,
      isDirector,
      isStaff,
      isAuthorized
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
