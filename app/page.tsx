'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { 
  Plus, Download, FolderOpen, ListFilter, Users, ArrowBigRight, 
  TrendingUp, TrendingDown, LogOut, FileSpreadsheet, LogIn,
  Trash2, Edit3, Eye, MoreVertical, Check, X, ArrowLeft, Search,
  User as UserIcon, Shield, ShieldAlert, ShieldCheck, Upload, Image as ImageIcon,
  Printer, FileText, Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { parseFile, AssociateRecord } from '@/lib/parser';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


export default function Page() {
  const { 
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
  } = useAuth();
  
  const [reports, setReports] = useState<any[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [headerStats, setHeaderStats] = useState<{ included: number; excluded: number } | null>(null);
  const [isHeaderLoading, setIsHeaderLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [view, setView] = useState<'dashboard' | 'comparison' | 'total' | 'report-details' | 'users' | 'profile' | 'logs'>('dashboard');
  
  // Login states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [registerLevel, setRegisterLevel] = useState('Funcionário');
  const [registrationMessage, setRegistrationMessage] = useState('');

  // User management states
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [systemLogs, setSystemLogs] = useState<any[]>([]);

  const logActivity = useCallback(async (action: string, details?: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('system_logs').insert({
        user_id: user.id,
        user_email: user.email,
        action,
        details
      });
      if (error) {
        console.error('Failed to log activity to Supabase:', error);
      }
    } catch (error) {
      console.error('Unexpected error logging activity:', error);
    }
  }, [user]);

  const fetchLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const { data, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching logs:', JSON.stringify(error, null, 2));
        // If the error is that the table doesn't exist, we should inform the user
        if (error.code === '42P01') {
          console.warn('The "system_logs" table does not exist. Please run the SQL migration.');
          alert('A tabela de logs ainda não foi criada no banco de dados. Por favor, execute o conteúdo do arquivo "supabase_migration.sql" no SQL Editor do seu painel Supabase.');
        } else {
          alert('Erro ao buscar logs: ' + (error.message || 'Erro desconhecido. Verifique o console.'));
        }
      } else {
        setSystemLogs(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching logs:', err);
    }
  }, [isSuperAdmin]);

  const exportLogsToTxt = () => {
    console.log('Exporting logs...', systemLogs.length);
    if (systemLogs.length === 0) {
      alert('Não há logs para exportar.');
      return;
    }
    
    try {
      const content = systemLogs.map(log => 
        `[${new Date(log.created_at).toLocaleString('pt-BR')}] User: ${log.user_email} | Action: ${log.action}${log.details ? ` | Details: ${log.details}` : ''}`
      ).join('\n');
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `logs_sistema_${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error during log export:', error);
      alert('Erro ao exportar logs. Verifique o console.');
    }
  };

  const fetchUsers = useCallback(async () => {
    if (!isStaff) return;
    
    let q = supabase.from('profiles').select('*');
    
    if (isSuperAdmin) {
      // Super Admin enxerga todos
    } else if (isDirector) {
      // Diretores enxergam outros diretores e funcionários
      q = q.in('role', ['DIRECTOR', 'STAFF']);
    } else {
      // Funcionários enxergam apenas a si mesmos
      q = q.eq('id', user?.id);
    }
    
    q = q.order('created_at', { ascending: false });

    const { data, error } = await q;
    if (error) {
      console.error(error);
    } else {
      setAllUsers(data || []);
    }
  }, [user, isSuperAdmin, isDirector, isStaff]);

  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<'SUPER_ADMIN' | 'DIRECTOR' | 'STAFF'>('STAFF');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // Password change states
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordTargetUserId, setPasswordTargetUserId] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleLogout = async () => {
    setLoginEmail('');
    setLoginPass('');
    setLoginError('');
    setRegistrationMessage('');
    setRegisterName('');
    setIsRegistering(false);
    await logout();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmail(loginEmail, loginPass);
    } catch (err: any) {
      setLoginError(err.message || 'E-mail ou senha inválidos.');
    }
  };

  useEffect(() => {
    if (view === 'users' && isStaff) {
      setTimeout(() => fetchUsers(), 0);
      
      const channel = supabase
        .channel('profiles-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchUsers)
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [view, isStaff, fetchUsers]);

  useEffect(() => {
    if (view === 'logs' && isSuperAdmin) {
      setTimeout(() => fetchLogs(), 0);
      const channel = supabase
        .channel('logs-realtime')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_logs' }, fetchLogs)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [view, isSuperAdmin, fetchLogs]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDirector) {
      alert('Você não tem permissão para criar usuários.');
      return;
    }
    if (!newUserEmail || !newUserRole) return;
    try {
      const { error } = await supabase.from('profiles').insert({
        email: newUserEmail,
        name: newUserName,
        role: newUserRole,
        is_authorized: true,
        level: newUserRole === 'SUPER_ADMIN' ? 'SUPER-USUARIO' : (newUserRole === 'STAFF' ? 'Funcionário' : 'Diretoria')
      });
      if (error) throw error;
      
      await logActivity('Criou usuário', `Email: ${newUserEmail}, Cargo: ${newUserRole}`);
      setIsCreatingUser(false);
      setNewUserEmail('');
      setNewUserName('');
    } catch (err) {
      console.error(err);
      alert('Erro ao criar usuário');
    }
  };

  const [isRegistering, setIsRegistering] = useState(false);
  const [registerName, setRegisterName] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setRegistrationMessage('');
    try {
      await signUpWithEmail(loginEmail, loginPass, registerName, registerLevel);
      setRegistrationMessage(`Prezado ${registerName}, seu cadastro foi realizado! Por favor, acesse seu e-mail para confirmar a conta (verifique também a caixa de spam). Após confirmar, aguarde a autorização da diretoria para acessar o sistema.`);
    } catch (err: any) {
      setLoginError(err.message || 'Erro ao criar conta.');
    }
  };

  const updateUserAuthorization = async (id: string, is_authorized: boolean) => {
    const targetUser = allUsers.find(u => u.id === id);
    
    if (targetUser?.email === 'gliarte@gmail.com') {
      alert('Este usuário é protegido e suas permissões não podem ser alteradas.');
      return;
    }

    // Optimistic update
    setAllUsers(current => current.map(u => u.id === id ? { ...u, is_authorized } : u));
    
    try {
      const { error } = await supabase.from('profiles').update({ is_authorized }).eq('id', id);
      if (error) {
        // Rollback on error
        fetchUsers();
        throw error;
      }
      const targetUser = allUsers.find(u => u.id === id);
      await logActivity(is_authorized ? 'Autorizou usuário' : 'Desautorizou usuário', `Usuário: ${targetUser?.email || id}`);
    } catch (err: any) {
      console.error('Error updating authorization:', err);
      alert('Erro ao atualizar autorização: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const deleteUser = async (id: string) => {
    const targetUser = allUsers.find(u => u.id === id);
    
    if (targetUser?.email === 'gliarte@gmail.com') {
      alert('Este usuário é protegido e não pode ser excluído.');
      return;
    }

    if (window.confirm(`Tem certeza que deseja excluir o usuário ${targetUser?.name || targetUser?.email}? Esta ação também removerá o acesso dele do Supabase Auth.`)) {
      const originalUsers = [...allUsers];
      // Optimistic delete
      setAllUsers(current => current.filter(u => u.id !== id));
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = await fetch('/api/admin/delete-user', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ userId: id, requesterId: user?.id })
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Erro ao excluir usuário');
        }

        await logActivity('Excluiu usuário permanentemente', `Usuário: ${targetUser?.email || id}`);
      } catch (err: any) {
        console.error('Error deleting user:', err);
        setAllUsers(originalUsers);
        alert('Erro ao excluir usuário: ' + (err.message || 'Erro desconhecido'));
      }
    }
  };

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const handleAvatarUpdate = async (url: string) => {
    if (!user) return;
    setIsUpdatingProfile(true);
    console.log('Iniciando atualização de avatar para:', user.id);
    
    try {
      // Validate string length (Postgres has limits, and some API gateways too)
      if (url.length > 1024 * 1024) { // 1MB limit for the URL/Base64 string
        throw new Error('A imagem é muito grande para ser salva como texto no banco de dados. Tente uma imagem menor.');
      }

      const { data, error, status, statusText } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', user.id)
        .select();
      
      if (error) {
        console.error('Supabase Update Error (Direct):', error);
        console.error('Supabase Status:', status, statusText);
        
        // Detailed log without wrapping in object to see properties in console
        if (error.message) console.error('Error Message:', error.message);
        if (error.code) console.error('Error Code:', error.code);
        if (error.details) console.error('Error Details:', error.details);

        const errorMessage = error.message || (error as any).error_description || `Erro DB: ${error.code || status}`;
        throw new Error(errorMessage);
      }

      if (!data || data.length === 0) {
        console.warn('Nenhum perfil foi atualizado. Verifique se o ID do usuário existe na tabela profiles.');
        throw new Error('Nenhum perfil encontrado para atualizar.');
      }
      
      console.log('Avatar atualizado com sucesso no Supabase');
      await refreshProfile();
    } catch (err: any) {
      console.error('Catch block error:', err);
      const msg = err.message || 'Erro inesperado ao atualizar o avatar';
      alert('Erro ao atualizar avatar: ' + msg);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Limit to 1MB to avoid Base64 payload issues
    if (file.size > 1 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 1MB para garantir o salvamento.');
      return;
    }

    setIsUpdatingProfile(true);
    try {
      console.log('Iniciando upload de arquivo:', file.name, file.size);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.warn('Falha no upload para Storage, tentando Base64:', uploadError.message);
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64String = reader.result as string;
          console.log('Convertido para Base64, tamanho:', base64String.length);
          await handleAvatarUpdate(base64String);
        };
        reader.onerror = () => {
          alert('Erro ao ler o arquivo local.');
          setIsUpdatingProfile(false);
        };
        reader.readAsDataURL(file);
        return;
      }

      console.log('Upload para Storage concluído:', data?.path);
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      console.log('URL Pública obtida:', publicUrl);
      await handleAvatarUpdate(publicUrl);
    } catch (err: any) {
      console.error('Erro crítico no handleAvatarUpload:', err);
      alert('Erro ao processar avatar: ' + (err.message || 'Erro desconhecido'));
      setIsUpdatingProfile(false);
    }
  };

  const updateUserRole = async (id: string, role: string) => {
    const targetUser = allUsers.find(u => u.id === id);
    
    if (targetUser?.email === 'gliarte@gmail.com') {
      alert('Este usuário é protegido e seu cargo não pode ser alterado.');
      return;
    }

    // Optimistic update
    const newLevel = role === 'SUPER_ADMIN' ? 'SUPER-USUARIO' : (role === 'DIRECTOR' ? 'Diretoria' : 'Funcionário');
    setAllUsers(current => current.map(u => u.id === id ? { ...u, role, level: newLevel } : u));
    
    try {
      const { error } = await supabase.from('profiles').update({ role, level: newLevel }).eq('id', id);
      if (error) {
        fetchUsers();
        throw error;
      }
      const targetUser = allUsers.find(u => u.id === id);
      await logActivity('Alterou cargo de usuário', `Usuário: ${targetUser?.email || id}, Novo Cargo: ${role}`);
    } catch (err: any) {
      console.error('Error updating role:', err);
      alert('Erro ao atualizar cargo: ' + (err.message || 'Erro desconhecido'));
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTargetUserId || !newPasswordValue || newPasswordValue.length < 6) {
      alert('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const targetUser = allUsers.find(u => u.id === passwordTargetUserId) || { id: user?.id, email: user?.email };
      const isSelf = passwordTargetUserId === user?.id;

      if (isSelf) {
        // User updating their own password
        const { error } = await supabase.auth.updateUser({ password: newPasswordValue });
        if (error) throw error;
      } else if (isSuperAdmin) {
        // Super Admin updating another user's password
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch('/api/admin/update-password', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ userId: passwordTargetUserId, newPassword: newPasswordValue })
        });

        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Erro ao atualizar senha');
        }
      } else {
        throw new Error('Você não tem permissão para alterar a senha deste usuário.');
      }

      await logActivity('Alterou senha', `Usuário: ${targetUser?.email || passwordTargetUserId}`);
      alert('Senha atualizada com sucesso!');
      setIsChangingPassword(false);
      setPasswordTargetUserId(null);
      setNewPasswordValue('');
    } catch (err: any) {
      console.error('Error updating password:', err);
      alert('Erro ao atualizar senha: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setIsUpdatingPassword(false);
    }
  };
  
  // States for report management
  const [editingReport, setEditingReport] = useState<any>(null);
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [detailedAssociates, setDetailedAssociates] = useState<any[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'name', direction: 'asc' });
  const [searchTerm, setSearchTerm] = useState('');

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getProcessedAssociates = (associates: any[]) => {
    let filtered = [...associates];
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(a => 
        String(a.name || '').toLowerCase().includes(term) ||
        String(a.siape || '').toLowerCase().includes(term) ||
        String(a.siape2 || '').toLowerCase().includes(term) ||
        String(a.cpf || '').toLowerCase().includes(term) ||
        String(a.contract || '').toLowerCase().includes(term)
      );
    }

    return filtered.sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      
      if (typeof valA === 'string' && typeof valB === 'string') {
        const comparison = valA.localeCompare(valB, 'pt-BR', { sensitivity: 'base' });
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      }
      
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }
      
      return 0;
    });
  };

  const getUniquePeriods = useCallback(() => {
    const periods = reports.map(r => ({ 
      month: typeof r.month === 'string' ? parseInt(r.month) : r.month, 
      year: typeof r.year === 'string' ? parseInt(r.year) : r.year 
    }));
    const uniqueMap = new Map();
    periods.forEach(p => {
      const key = `${p.month}-${p.year}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, p);
      }
    });
    
    return Array.from(uniqueMap.values())
      .sort((a, b: any) => b.year - a.year || b.month - a.month);
  }, [reports]);

  const [queryPeriod, setQueryPeriod] = useState<{ month: number; year: number } | null>(null);

  const getQuerySummary = () => {
    if (!queryPeriod) return null;
    const filtered = reports.filter(r => {
      const m = typeof r.month === 'string' ? parseInt(r.month) : r.month;
      const y = typeof r.year === 'string' ? parseInt(r.year) : r.year;
      return m === queryPeriod.month && y === queryPeriod.year;
    });
    if (filtered.length === 0) return null;

    const totalAssociates = filtered.reduce((acc, r) => acc + (r.total_associates || 0), 0);
    const totalValue = filtered.reduce((acc, r) => acc + (r.total_value || 0), 0);
    
    const monthNames = [
      '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    return {
      monthName: monthNames[queryPeriod.month],
      year: queryPeriod.year,
      totalAssociates,
      totalValue,
      reportsCount: filtered.length
    };
  };

  const querySummary = getQuerySummary();

  // States for comparison
  const [baseReportId, setBaseReportId] = useState<string | null>(null);
  const [targetReportId, setTargetReportId] = useState<string | null>(null);
  const [diffType, setDiffType] = useState<'included' | 'excluded'>('included');
  const [diffResults, setDiffResults] = useState<any[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  // States for "Para Próxima Folha"
  const [nextPayrollRecords, setNextPayrollRecords] = useState<any[]>([]);
  const [nextCpf, setNextCpf] = useState('');
  const [nextName, setNextName] = useState('');
  const [nextOccurrence, setNextOccurrence] = useState<'INCLUSÃO' | 'EXCLUSÃO'>('INCLUSÃO');
  const [nextPayrollPage, setNextPayrollPage] = useState(1);
  const [isSavingNextPayroll, setIsSavingNextPayroll] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // States for total value
  const [totalValueReportId, setTotalValueReportId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error(error);
    } else {
      setReports(data || []);
      setHistoryPage(1);
    }
  }, [user]);

  const fetchNextPayroll = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('next_payroll_records')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        // Se a tabela não existir, apenas mostramos um aviso silencioso no console
        // e mantemos a lista vazia em vez de estourar um erro de execução
        console.warn('Tabela next_payroll_records ainda não criada no Supabase.');
        setNextPayrollRecords([]);
        return;
      }
      setNextPayrollRecords(data || []);
      setNextPayrollPage(1);
    } catch (error) {
      console.error('Erro ao buscar dados da próxima folha:', error);
    }
  }, []);

  const saveNextPayroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nextCpf || !nextName) return;

    setIsSavingNextPayroll(true);
    try {
      const { error } = await supabase
        .from('next_payroll_records')
        .insert({
          cpf: nextCpf,
          name: nextName,
          occurrence: nextOccurrence,
          created_by: user?.id
        });

      if (error) throw error;
      
      await logActivity('Para Próxima Folha - Registro Adicionado', `CPF: ${nextCpf}, Nome: ${nextName}, Tipo: ${nextOccurrence}`);

      setNextCpf('');
      setNextName('');
      fetchNextPayroll();
    } catch (error) {
      console.error('Error saving next payroll:', error);
      alert('Erro ao salvar registro. Verifique suas permissões.');
    } finally {
      setIsSavingNextPayroll(false);
    }
  };

  const deleteNextPayroll = async (id: string) => {
    if (!confirm('Deseja excluir este registro?')) return;

    try {
      const record = nextPayrollRecords.find(r => r.id === id);
      
      const { error } = await supabase
        .from('next_payroll_records')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await logActivity('Para Próxima Folha - Registro Excluído', `CPF: ${record?.cpf || id}, Nome: ${record?.name || 'N/A'}`);

      fetchNextPayroll();
    } catch (error) {
      console.error('Error deleting next payroll:', error);
    }
  };

  const clearAllNextPayroll = async () => {
    if (!confirm('ATENÇÃO: Você tem certeza que deseja LIMPAR TODOS os registros pendentes para a próxima folha? Esta ação não pode ser desfeita.')) return;
    
    try {
      const count = nextPayrollRecords.length;
      
      // Para deletar múltiplos registros via SDK do Supabase com RLS, 
      // precisamos de uma condição que cubra todos eles
      const { error } = await supabase
        .from('next_payroll_records')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      
      await logActivity('Para Próxima Folha - LIMPEZA TOTAL', `Todos os ${count} registros pendentes foram apagados.`);

      fetchNextPayroll();
    } catch (error) {
      console.error('Error clearing next payroll:', error);
      alert('Erro ao limpar registros. Verifique suas permissões.');
    }
  };

  const exportToPDF = (title: string, headers: string[], rows: any[][], fileName: string) => {
    try {
      const doc = new jsPDF();
      doc.text(title, 14, 15);
      autoTable(doc, {
        head: [headers],
        body: rows,
        startY: 20,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 0, 0] }
      });
      doc.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  const handlePrint = () => {
    // Garante o foco na janela atual antes de disparar o comando de impressão
    window.focus();
    try {
      logActivity('Impressão Acionada', 'Usuário solicitou impressão da tela atual');
      window.print();
    } catch (error) {
      console.error('Falha ao abrir diálogo de impressão:', error);
      alert('Se o diálogo de impressão não abrir, tente abrir o app em uma nova guia ou use o botão de PDF.');
    }
  };

  const handleExportReportDetails = () => {
    const currentReport = reports.find(r => r.id === selectedReportId);
    if (!currentReport) return;

    logActivity('Exportação de Relatório (PDF)', `Arquivo: ${currentReport.filename}, Categoria: ${currentReport.category}`);

    const associates = getProcessedAssociates(detailedAssociates);
    const isPensionista = currentReport.category === 'pensionista';
    
    let headers = [];
    if (isPensionista) {
      headers = ['SIAPE 1', 'SIAPE 2', 'NOME', 'CPF', 'CONTRATO'];
    } else {
      headers = ['SIAPE', 'NOME', 'CPF', 'CONTRATO'];
    }

    if (isStaff) {
      headers.splice(isPensionista ? 4 : 3, 0, 'VALOR (R$)');
    }

    const rows = associates.map(a => {
      let row = [];
      if (isPensionista) {
        row = [a.siape || '', a.siape2 || '', a.name, a.cpf, a.contract || ''];
      } else {
        row = [a.siape || '', a.name, a.cpf, a.contract || ''];
      }

      if (isStaff) {
        row.splice(isPensionista ? 4 : 3, 0, a.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
      }
      return row;
    });

    exportToPDF(
      `Relatório: ${currentReport.filename}`,
      headers,
      rows,
      `relatorio_${currentReport.filename.replace(/\s+/g, '_')}`
    );
  };

  const handleExportComparison = () => {
    const title = diffType === 'included' ? 'Filiações' : 'Desfiliações';
    
    logActivity('Exportação de Comparação (PDF)', `Tipo: ${title}`);

    const filteredResults = diffResults.filter(r => !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    let headers = ['SIAPE', 'NOME', 'CPF', 'CONTRATO'];
    if (isStaff) {
      headers.splice(3, 0, 'VALOR (R$)');
    }

    const rows = filteredResults.map(r => {
      let row = [
        `${r.siape}${r.siape2 ? ' / ' + r.siape2 : ''}`,
        r.name,
        r.cpf,
        r.contract || ''
      ];
      if (isStaff) {
        row.splice(3, 0, r.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
      }
      return row;
    });

    exportToPDF(
      title,
      headers,
      rows,
      `comparacao_${diffType}`
    );
  };

  const handleExportNextPayroll = () => {
    logActivity('Exportação Próxima Folha (PDF)', `Registros: ${nextPayrollRecords.length}`);

    const headers = ['CPF', 'NOME', 'OCORRÊNCIA', 'DATA'];
    const rows = nextPayrollRecords.map(r => [
      r.cpf,
      r.name,
      r.occurrence,
      new Date(r.created_at).toLocaleDateString('pt-BR')
    ]);

    exportToPDF(
      'Para Próxima Folha',
      headers,
      rows,
      'para_proxima_folha'
    );
  };

  useEffect(() => {
    if (!user) return;

    const timeoutId = setTimeout(() => {
      fetchReports();
      fetchNextPayroll();
    }, 0);

    const channel = supabase
      .channel('reports-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, fetchReports)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'next_payroll_records' }, fetchNextPayroll)
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [user, fetchReports, fetchNextPayroll]);

  const normalizeName = (name: string) => {
    if (!name) return '';
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase();
  };

  useEffect(() => {
    const fetchHeaderStats = async () => {
      if (reports.length === 0) {
        setHeaderStats(null);
        return;
      }

      setIsHeaderLoading(true);
      try {
        // Group reports by month-year
        const groupsMap = new Map<string, any[]>();
        reports.forEach(r => {
          const month = typeof r.month === 'string' ? parseInt(r.month) : r.month;
          const year = typeof r.year === 'string' ? parseInt(r.year) : r.year;
          const key = `${year}-${month.toString().padStart(2, '0')}`;
          if (!groupsMap.has(key)) groupsMap.set(key, []);
          groupsMap.get(key)!.push(r);
        });

        // Sort keys descending (most recent first)
        const sortedKeys = Array.from(groupsMap.keys()).sort().reverse();
        
        if (sortedKeys.length < 2) {
          setHeaderStats(null);
          return;
        }

        const fetchCPFsForMonth = async (monthKey: string) => {
          const monthReports = groupsMap.get(monthKey)!;
          const cpfs = new Set<string>();
          
          for (const report of monthReports) {
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;
            
            while (hasMore) {
              const { data, error } = await supabase
                .from('associates')
                .select('cpf')
                .eq('report_id', report.id)
                .range(from, from + pageSize - 1);
              
              if (error) throw error;
              if (data && data.length > 0) {
                data.forEach(d => {
                  if (d.cpf) cpfs.add(d.cpf.trim());
                });
                from += pageSize;
                if (data.length < pageSize) hasMore = false;
              } else {
                hasMore = false;
              }
            }
          }
          return cpfs;
        };

        const currentPool = await fetchCPFsForMonth(sortedKeys[0]);
        const previousPool = await fetchCPFsForMonth(sortedKeys[1]);

        let included = 0;
        let excluded = 0;

        currentPool.forEach(cpf => {
          if (!previousPool.has(cpf)) included++;
        });
        previousPool.forEach(cpf => {
          if (!currentPool.has(cpf)) excluded++;
        });

        setHeaderStats({ included, excluded });
      } catch (err) {
        console.error('Error fetching header stats:', err);
      } finally {
        setIsHeaderLoading(false);
      }
    };

    fetchHeaderStats();
  }, [reports]);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState({ month: new Date().getMonth() + 1, year: new Date().getFullYear(), category: 'normal' });
  const [uploadKey, setUploadKey] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setShowSuccess(false);
      setPendingFile(file);
    }
  };

  const resetUpload = () => {
    setPendingFile(null);
    setUploadMetadata({ 
      month: new Date().getMonth() + 1, 
      year: new Date().getFullYear(), 
      category: 'normal' 
    });
    setUploadKey(prev => prev + 1);
    setShowSuccess(false);
  };

  const confirmUpload = async () => {
    if (!pendingFile || !user) return;

    setIsUploading(true);
    try {
      const records = await parseFile(pendingFile, uploadMetadata.category);
      const totalValue = records.reduce((acc, curr) => acc + curr.value, 0);

      const { data: report, error: reportError } = await supabase
        .from('reports')
        .insert({
          month: uploadMetadata.month.toString(),
          year: uploadMetadata.year,
          category: uploadMetadata.category,
          filename: pendingFile.name,
          total_value: totalValue,
          total_associates: records.length,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (reportError) throw reportError;

      await logActivity('Arquivo enviado', `Nome: ${pendingFile.name}, Mês: ${uploadMetadata.month}/${uploadMetadata.year}, Categoria: ${uploadMetadata.category}`);

      // Batch insert associates. Supabase supports bulk inserts.
      const batchSize = 1000;
      for (let i = 0; i < records.length; i += batchSize) {
        const chunk = records.slice(i, i + batchSize).map(r => ({
          report_id: report.id,
          name: r.name,
          value: r.value,
          siape: r.siape,
          siape2: r.siape2,
          cpf: r.cpf,
          contract: r.contract,
          pensionista: r.pensionista
        }));
        
        const { error: associatesError } = await supabase
          .from('associates')
          .insert(chunk);
          
        if (associatesError) throw associatesError;
      }

      await fetchReports();
      setShowSuccess(true);
    } catch (err: any) {
      alert('Erro ao processar arquivo: ' + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const deleteReport = async (reportId: string) => {
    setIsActionLoading(true);
    try {
      const targetReport = reports.find(r => r.id === reportId);
      
      // Cascading delete is handled by DB schema
      const { error } = await supabase.from('reports').delete().eq('id', reportId);
      if (error) throw error;
      
      await logActivity('Relatório excluído', `Arquivo: ${targetReport?.filename || reportId}`);

      await fetchReports();
      
      if (selectedReportId === reportId) {
        setView('dashboard');
        setSelectedReportId(null);
      }
      setDeletingReportId(null);
    } catch (err: any) {
      alert('Erro ao excluir lista: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const updateReport = async (reportId: string, data: any) => {
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from('reports').update(data).eq('id', reportId);
      if (error) throw error;
      
      await logActivity('Relatório atualizado', `ID: ${reportId}, Novos Dados: ${JSON.stringify(data)}`);

      await fetchReports();
      setEditingReport(null);
    } catch (err: any) {
      alert('Erro ao atualizar lista: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const fetchReportDetails = async (reportId: string) => {
    setSelectedReportId(reportId);
    setView('report-details');
    setSearchTerm('');
    setIsActionLoading(true);
    try {
      const report = reports.find(r => r.id === reportId);
      await logActivity('Visualizou Detalhes', `Arquivo: ${report?.filename || reportId}`);

      let allData: any[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('associates')
          .select('*')
          .eq('report_id', reportId)
          .range(from, from + pageSize - 1);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          if (from === 0) {
            console.log('Exemplo de associado carregado:', data[0]);
          }
          allData = [...allData, ...data];
          from += pageSize;
          if (data.length < pageSize) hasMore = false;
        } else {
          hasMore = false;
        }
      }
      setDetailedAssociates(allData);
    } catch (err: any) {
      alert('Erro ao carregar detalhes: ' + err.message);
    } finally {
      setIsActionLoading(false);
    }
  };

  const compareReports = async (type: 'included' | 'excluded') => {
    if (!baseReportId || !targetReportId) {
      alert('Selecione duas listas para comparar.');
      return;
    }

    const baseReport = reports.find(r => r.id === baseReportId);
    const targetReport = reports.find(r => r.id === targetReportId);

    if (!baseReport || !targetReport) return;

    if (baseReport.category !== targetReport.category) {
      alert('Não é permitido comparar arquivos de categorias diferentes.');
      return;
    }

    // Identify oldest and newest based on month/year
    const dateToNumber = (r: any) => {
      const year = typeof r.year === 'string' ? parseInt(r.year) : r.year;
      const month = typeof r.month === 'string' ? parseInt(r.month) : r.month;
      return year * 100 + month;
    };

    const dateA = dateToNumber(baseReport);
    const dateB = dateToNumber(targetReport);

    let olderReport, newerReport;
    if (dateA < dateB) {
      olderReport = baseReport;
      newerReport = targetReport;
    } else {
      olderReport = targetReport;
      newerReport = baseReport;
    }

    setIsComparing(true);
    setDiffType(type);
    setSearchTerm('');
    setView('comparison');

    try {
      await logActivity('Comparou Listas', `De: ${olderReport.filename} (${olderReport.month}/${olderReport.year}) Para: ${newerReport.filename} (${newerReport.month}/${newerReport.year}) | Tipo: ${type === 'included' ? 'Filiações' : 'Desfiliações'}`);

      const fetchAssociates = async (id: string) => {
        let allData: any[] = [];
        let from = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('associates')
            .select('name, value, cpf, siape, siape2, contract')
            .eq('report_id', id)
            .range(from, from + pageSize - 1);
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            allData = [...allData, ...data];
            from += pageSize;
            if (data.length < pageSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
        return allData;
      };

      const olderRecords = await fetchAssociates(olderReport.id);
      const newerRecords = await fetchAssociates(newerReport.id);

      // Using CPF as the comparison key as requested
      const olderCpfSet = new Set<string>();
      olderRecords.forEach((r: any) => {
        if (r.cpf) olderCpfSet.add(r.cpf.trim());
      });

      const newerCpfSet = new Set<string>();
      newerRecords.forEach((r: any) => {
        if (r.cpf) newerCpfSet.add(r.cpf.trim());
      });

      let results: any[] = [];
      if (type === 'included') {
        // Included: Exists in Newer AND NOT in Older (compared by CPF)
        results = newerRecords.filter((r: any) => {
          return r.cpf && !olderCpfSet.has(r.cpf.trim());
        });
      } else {
        // Excluded: Exists in Older AND NOT in Newer (compared by CPF)
        results = olderRecords.filter((r: any) => {
          return r.cpf && !newerCpfSet.has(r.cpf.trim());
        });
      }

      setDiffResults(results.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')));
    } catch (err: any) {
      alert('Erro na comparação: ' + err.message);
    } finally {
      setIsComparing(false);
    }
  };

  const getLatestSummary = () => {
    if (reports.length === 0) return null;

    // Group reports by month-year to find the absolute latest period
    const groupsMap = new Map<string, any[]>();
    reports.forEach(r => {
      const month = typeof r.month === 'string' ? parseInt(r.month) : r.month;
      const year = typeof r.year === 'string' ? parseInt(r.year) : r.year;
      const key = `${year}-${month.toString().padStart(2, '0')}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(r);
    });

    const sortedKeys = Array.from(groupsMap.keys()).sort().reverse();
    const latestMonthKey = sortedKeys[0];
    const latestReports = groupsMap.get(latestMonthKey)!;

    const totalAssociates = latestReports.reduce((acc, r) => acc + (r.total_associates || 0), 0);
    const totalValue = latestReports.reduce((acc, r) => acc + (r.total_value || 0), 0);

    const monthNames = [
      '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const [year, month] = latestMonthKey.split('-').map(Number);

    return {
      month: monthNames[month],
      year,
      totalAssociates,
      totalValue
    };
  };

  const summary = getLatestSummary();
  
  const renderReportCard = (report: any) => (
    <div 
      key={report.id}
      className="bg-white p-5 rounded-[20px] border border-zinc-100 shadow-sm hover:border-zinc-300 transition-all group relative"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="bg-zinc-100 p-2 rounded-lg group-hover:bg-black group-hover:text-white transition-colors">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${report.category === 'pensionista' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
            {report.category || 'normal'}
          </span>
          
          {isSuperAdmin && (
            deletingReportId === report.id ? (
              <div className="flex items-center gap-1 bg-red-50 p-1 rounded-lg">
                <span className="text-[10px] font-bold text-red-600 px-1">Excluir?</span>
                <button 
                  onClick={() => deleteReport(report.id)}
                  className="p-1 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button 
                  onClick={() => setDeletingReportId(null)}
                  className="p-1 bg-zinc-200 text-black rounded hover:bg-zinc-300 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <>
                <button 
                  onClick={() => fetchReportDetails(report.id)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-[#9E9E9E] hover:text-black"
                  title="Ver detalhes"
                >
                  <Eye className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setEditingReport(report)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-[#9E9E9E] hover:text-black"
                  title="Editar metadados"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => setDeletingReportId(report.id)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-[#9E9E9E] hover:text-red-600"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )
          )}
          {!isSuperAdmin && (
            <button 
              onClick={() => fetchReportDetails(report.id)}
              className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors text-[#9E9E9E] hover:text-black"
              title="Ver detalhes"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      
      {editingReport?.id === report.id ? (
        <div className="space-y-2 mb-4">
          <input 
            className="w-full bg-zinc-50 border border-zinc-200 rounded p-1 text-sm"
            value={editingReport.filename}
            onChange={e => setEditingReport({...editingReport, filename: e.target.value})}
          />
          <div className="flex gap-2">
            <input 
              type="number"
              className="w-1/2 bg-zinc-50 border border-zinc-200 rounded p-1 text-sm"
              value={editingReport.month}
              onChange={e => setEditingReport({...editingReport, month: parseInt(e.target.value)})}
            />
            <input 
              type="number"
              className="w-1/2 bg-zinc-50 border border-zinc-200 rounded p-1 text-sm"
              value={editingReport.year}
              onChange={e => setEditingReport({...editingReport, year: parseInt(e.target.value)})}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={() => updateReport(report.id, { filename: editingReport.filename, month: editingReport.month, year: editingReport.year })} className="bg-black text-white text-[10px] px-3 py-1 rounded">Salvar</button>
            <button onClick={() => setEditingReport(null)} className="bg-zinc-100 text-black text-[10px] px-3 py-1 rounded">Cancelar</button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm truncate">{report.filename}</h3>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 bg-zinc-100 rounded-full whitespace-nowrap">
              {report.month}/{report.year}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#9E9E9E]">
            <span>{report.total_associates} associados</span>
            {isDirector && <span>R$ {(report.total_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>}
          </div>
        </>
      )}
    </div>
  );

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#F5F5F5]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
    </div>
  );

  if (!user) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-10 rounded-[40px] shadow-sm w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <Image 
              src="https://lh3.googleusercontent.com/d/1f05VVYZFE-QwsmlBnvMG-vzslk7lPIi-" 
              alt="Logo SINTUFPI" 
              width={300}
              height={128}
              className="h-32 w-auto object-contain mx-auto"
              priority
              unoptimized
            />
          </div>
          <h1 className="text-3xl font-medium tracking-tight mb-2">Gestor de Associados</h1>
        </div>

        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
          {isRegistering && (
            <>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1.5 block px-1">Nome Completo</label>
                <input 
                  required
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                  placeholder="Seu nome"
                  value={registerName}
                  onChange={(e) => setRegisterName(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1.5 block px-1">Nível de Acesso</label>
                <div className="flex gap-2">
                  {['Diretoria', 'Funcionário'].map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setRegisterLevel(l)}
                      className={`flex-1 py-3 rounded-2xl text-xs font-medium transition-all ${registerLevel === l ? 'bg-black text-white' : 'bg-zinc-50 text-[#9E9E9E] border border-zinc-200'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1.5 block px-1">E-mail</label>
            <input 
              type="email"
              required
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              placeholder="Digite seu e-mail"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1.5 block px-1">Senha</label>
            <input 
              type="password"
              required
              className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl px-5 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
              placeholder="Digite sua senha"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
            />
          </div>

          {loginError && (
            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {loginError}
            </div>
          )}

          {registrationMessage && (
            <div className="bg-green-50 text-green-700 p-4 rounded-xl text-xs border border-green-100 leading-relaxed font-medium">
              {registrationMessage}
            </div>
          )}

          <button 
            type="submit"
            disabled={isSigningIn}
            className="w-full bg-black text-white py-4 rounded-full flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors disabled:opacity-50 mt-4 shadow-lg shadow-black/10"
          >
            {isSigningIn ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              <LogIn className="w-5 h-5" />
            )}
            {isRegistering ? 'Criar Conta' : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-xs text-zinc-500 hover:text-black transition-colors"
          >
            {isRegistering ? 'Já tem uma conta? Entrar agora' : 'Primeiro acesso? Crie sua conta aqui'}
          </button>
        </div>
      </motion.div>
    </div>
  );

  if (!isAuthorized) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F5F5] p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-12 rounded-[40px] shadow-sm w-full max-w-lg"
      >
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-8">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-3xl font-medium tracking-tight mb-4">Aguardando Autorização</h1>
        <p className="text-[#9E9E9E] leading-relaxed mb-8">
          Prezado <span className="text-black font-bold">{profile?.name}</span>, sua conta foi criada com sucesso, mas ainda não foi autorizada pela diretoria.
          <br /><br />
          Por favor, aguarde o processo de validação. Você receberá acesso assim que um administrador aprovar seu perfil no sistema.
        </p>
        <button 
          onClick={handleLogout}
          className="bg-zinc-100 text-black px-8 py-3 rounded-2xl text-sm font-medium hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 mx-auto"
        >
          <LogOut className="w-4 h-4" /> Sair do Sistema
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F5F5F5] text-[#1A1A1A] font-sans selection:bg-zinc-200">
      {/* Global Loading Overlay */}
      <AnimatePresence>
        {isActionLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[100] flex flex-col items-center justify-center"
          >
            <div className="bg-white p-6 rounded-3xl shadow-xl flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-black"></div>
              <p className="text-sm font-medium">Processando dados...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-10 px-8 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="bg-black text-white p-2 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-medium tracking-tight">Gestor de Associados SINTUFPI</h1>
        </div>

        {summary && (
          <div className="flex flex-col items-end lg:items-center text-right lg:text-center">
            <div className="flex items-center gap-3 lg:gap-6">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9E9E9E]">Associados</span>
                <span className="text-xl font-bold tracking-tight">{summary.totalAssociates.toLocaleString('pt-BR')}</span>
              </div>
              
              {isDirector && (
                <>
                  <div className="w-px h-8 bg-zinc-100" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600">Valor Acumulado</span>
                    <span className="text-xl font-bold tracking-tight text-amber-900">
                      {summary.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </>
              )}

              {headerStats && (
                <>
                  <div className="w-px h-8 bg-zinc-100" />
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-green-600">FILIAÇÕES</span>
                      <span className="text-xl font-bold tracking-tight text-green-600">+{headerStats.included}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-600">DESFILIAÇÕES</span>
                      <span className="text-xl font-bold tracking-tight text-red-600">-{headerStats.excluded}</span>
                    </div>
                  </div>
                </>
              )}

              {isHeaderLoading && (
                <>
                  <div className="w-px h-8 bg-zinc-100" />
                  <div className="animate-pulse flex gap-4">
                    <div className="h-10 w-16 bg-zinc-100 rounded-lg"></div>
                    <div className="h-10 w-16 bg-zinc-100 rounded-lg"></div>
                  </div>
                </>
              )}
            </div>
            <p className="text-[10px] font-medium text-zinc-500 mt-1 uppercase tracking-widest bg-zinc-50 px-3 py-1 rounded-full border border-zinc-100">
              Referência: {summary.month} / {summary.year}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* User management and profile icons */}
          {isSuperAdmin && (
            <button 
              onClick={() => setView('logs')}
              className={`p-3 rounded-2xl transition-all ${view === 'logs' ? 'bg-black text-white shadow-lg shadow-black/10' : 'bg-white text-[#9E9E9E] hover:bg-zinc-100 hover:text-black border border-zinc-100'}`}
              title="Logs do Sistema"
            >
              <FileText className="w-5 h-5" />
            </button>
          )}

          {isStaff && (
            <button 
              onClick={() => setView('users')}
              className={`p-3 rounded-2xl transition-all ${view === 'users' ? 'bg-black text-white shadow-lg shadow-black/10' : 'bg-white text-[#9E9E9E] hover:bg-zinc-100 hover:text-black border border-zinc-100'}`}
              title="Gestão de Usuários"
            >
              <Users className="w-5 h-5" />
            </button>
          )}

          <button 
            onClick={() => setView('profile')}
            className={`p-1 rounded-2xl transition-all overflow-hidden ${view === 'profile' ? 'bg-black text-white shadow-lg shadow-black/10' : 'bg-white text-[#9E9E9E] hover:bg-zinc-100 hover:text-black border border-zinc-100'}`}
            title="Meu Perfil"
          >
            {profile?.avatar_url ? (
              <div className="w-9 h-9 relative rounded-xl overflow-hidden">
                <Image 
                  src={profile.avatar_url} 
                  alt="Avatar" 
                  fill 
                  className="object-cover" 
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="p-2">
                <UserIcon className="w-5 h-5" />
              </div>
            )}
          </button>

          <div className="w-px h-8 bg-zinc-200 mx-1 hidden sm:block" />

          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium leading-none mb-1">{profile?.name || user.email || 'Usuário'}</p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] leading-none">
              {isSuperAdmin ? 'Super-Admin' : isDirector ? 'Diretoria' : isStaff ? 'Staff' : 'Visitante'}
            </p>
          </div>

          <button 
            onClick={handleLogout}
            className="p-3 bg-white text-[#9E9E9E] hover:text-red-500 hover:bg-red-50 transition-all rounded-2xl border border-zinc-100 hover:border-red-100"
            title="Sair"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 pt-8 pb-4 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar / Upload Section */}
        {view !== 'users' && view !== 'profile' && view !== 'logs' && (
          <section className="lg:col-span-4 space-y-6 no-print">
            {/* Nova Lista - Only for SUPER_ADMIN */}
            {isSuperAdmin && (
              <div className="bg-white p-6 rounded-[24px] shadow-sm border border-zinc-100">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-[#9E9E9E] mb-4">Novo Upload (Super-Adm)</h2>
                
                {showSuccess ? (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-green-50 border border-green-100 rounded-[20px] p-6 text-center"
                >
                  <div className="w-12 h-12 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-6 h-6" />
                  </div>
                  <h3 className="text-green-800 font-medium mb-1">Upload Concluído</h3>
                  <p className="text-green-600 text-xs mb-4">O arquivo foi processado e salvo com sucesso.</p>
                  <button 
                    onClick={resetUpload}
                    className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-green-700 transition-all"
                  >
                    Novo Upload
                  </button>
                </motion.div>
              ) : pendingFile ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100">
                    <p className="text-xs font-bold text-black uppercase mb-1">Arquivo Selecionado</p>
                    <p className="text-sm truncate text-[#9E9E9E]">{pendingFile.name}</p>
                  </div>
  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#9E9E9E] block mb-1">Mês</label>
                      <input 
                        type="number" min="1" max="12"
                        value={uploadMetadata.month}
                        onChange={e => setUploadMetadata({...uploadMetadata, month: parseInt(e.target.value)})}
                        className="w-full bg-zinc-100 border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-[#9E9E9E] block mb-1">Ano</label>
                      <input 
                        type="number"
                        value={uploadMetadata.year}
                        onChange={e => setUploadMetadata({...uploadMetadata, year: parseInt(e.target.value)})}
                        className="w-full bg-zinc-100 border-none rounded-lg p-2 text-sm focus:ring-2 focus:ring-black outline-none"
                      />
                    </div>
                  </div>
  
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-[#9E9E9E] block mb-1">Tipo de Lista</label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setUploadMetadata({...uploadMetadata, category: 'normal'})}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${uploadMetadata.category === 'normal' ? 'bg-black text-white' : 'bg-zinc-100 text-[#9E9E9E]'}`}
                      >
                        Normal
                      </button>
                      <button 
                        onClick={() => setUploadMetadata({...uploadMetadata, category: 'pensionista'})}
                        className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${uploadMetadata.category === 'pensionista' ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-[#9E9E9E]'}`}
                      >
                        Pensionista
                      </button>
                    </div>
                  </div>
  
                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={confirmUpload}
                      disabled={isUploading}
                      className="flex-1 bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all disabled:opacity-50"
                    >
                      {isUploading ? 'Processando...' : 'Confirmar Upload'}
                    </button>
                    <button 
                      onClick={resetUpload}
                      className="px-4 bg-zinc-100 text-black py-3 rounded-xl text-sm font-medium hover:bg-zinc-200 transition-all"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </motion.div>
              ) : (
                <label className="relative group flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-zinc-200 rounded-[20px] cursor-pointer hover:border-black hover:bg-zinc-50 transition-all">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="p-3 bg-zinc-100 rounded-full group-hover:bg-black group-hover:text-white transition-colors mb-3">
                      <Plus className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium">Carregar Excel ou CSV</p>
                    <p className="text-xs text-[#9E9E9E]">Solte o arquivo ou clique aqui</p>
                  </div>
                  <input key={uploadKey} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} />
                </label>
              )}
            </div>
          )}
  
            <div className="bg-white p-6 rounded-[24px] shadow-sm border border-zinc-100">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-[#9E9E9E] mb-4">HISTÓRICO DE FILIAÇÕES E DESFILIAÇÕES</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium mb-1 block">Lista 1</label>
                  <select 
                    className="w-full bg-zinc-100 border-none rounded-lg p-2 text-sm"
                    value={baseReportId || ''}
                    onChange={(e) => setBaseReportId(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {reports.map(r => (
                      <option key={r.id} value={r.id}>{r.month}/{r.year} - {r.category} - {r.filename}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">Lista 2</label>
                  <select 
                    className="w-full bg-zinc-100 border-none rounded-lg p-2 text-sm"
                    value={targetReportId || ''}
                    onChange={(e) => setTargetReportId(e.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {reports.map(r => (
                      <option key={r.id} value={r.id}>{r.month}/{r.year} - {r.category} - {r.filename}</option>
                    ))}
                  </select>
                </div>
                <div className="flex w-full space-x-2 pt-2">
                  <button 
                    onClick={() => compareReports('included')}
                    className="flex-1 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center hover:opacity-90"
                    style={{ backgroundColor: '#16A34A', border: '1px solid #16A34A' }}
                  >
                    <TrendingUp className="w-4 h-4 mr-2" /> Filiações
                  </button>
                  <button 
                    onClick={() => compareReports('excluded')}
                    className="flex-1 text-white text-xs font-bold py-3 rounded-xl flex items-center justify-center hover:opacity-90"
                    style={{ backgroundColor: '#DC2626', border: '1px solid #DC2626' }}
                  >
                    <TrendingDown className="w-4 h-4 mr-2" /> Desfiliações
                  </button>
                </div>
              </div>
            </div>

            {/* PARA PRÓXIMA FOLHA Section */}
            <div className="bg-white p-6 rounded-[24px] shadow-sm border border-zinc-100">
              <div className="print-only mb-8 text-center border-b pb-4">
                <h1 className="text-2xl font-bold uppercase">SINTUFPI - Gestor de Associados</h1>
                <h2 className="text-xl mt-2">Relatório: Para Próxima Folha</h2>
                <p className="text-sm text-zinc-500 mt-1">Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
              </div>

              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-600" />
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-black">Para Próxima Folha</h2>
                </div>
                
                {nextPayrollRecords.length > 0 && (
                  <div className="flex items-center gap-2 no-print">
                    {isSuperAdmin && (
                      <button 
                        onClick={clearAllNextPayroll}
                        className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition-all border border-red-100 text-[10px] font-bold uppercase tracking-widest mr-2"
                        title="Limpar todos os registros"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Limpar Tudo
                      </button>
                    )}
                    <button 
                      onClick={handleExportNextPayroll}
                      className="p-2 bg-zinc-50 text-[#9E9E9E] hover:text-black hover:bg-zinc-100 rounded-xl transition-all border border-zinc-100"
                      title="Exportar PDF"
                    >
                      <FileText className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={handlePrint}
                      className="p-2 bg-zinc-50 text-[#9E9E9E] hover:text-black hover:bg-zinc-100 rounded-xl transition-all border border-zinc-100"
                      title="Imprimir"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {isSuperAdmin && (
                <form onSubmit={saveNextPayroll} className="space-y-3 mb-6 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                  <p className="text-[10px] font-bold text-[#9E9E9E] uppercase tracking-widest mb-2">Novo Registro (Super-Adm)</p>
                  <div>
                    <input 
                      required
                      type="text"
                      placeholder="CPF do Associado"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5"
                      value={nextCpf}
                      onChange={(e) => setNextCpf(e.target.value)}
                    />
                  </div>
                  <div>
                    <input 
                      required
                      type="text"
                      placeholder="Nome do Associado"
                      className="w-full bg-white border border-zinc-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/5"
                      value={nextName}
                      onChange={(e) => setNextName(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setNextOccurrence('INCLUSÃO')}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${nextOccurrence === 'INCLUSÃO' ? 'bg-black text-white border-black' : 'bg-white text-[#9E9E9E] border-zinc-200'}`}
                    >
                      Inclusão
                    </button>
                    <button 
                      type="button"
                      onClick={() => setNextOccurrence('EXCLUSÃO')}
                      className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all border ${nextOccurrence === 'EXCLUSÃO' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-[#9E9E9E] border-zinc-200'}`}
                    >
                      Exclusão
                    </button>
                  </div>
                  <button 
                    type="submit"
                    disabled={isSavingNextPayroll}
                    className="w-full bg-black text-white py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:opacity-50"
                  >
                    {isSavingNextPayroll ? 'Salvando...' : 'Adicionar à Lista'}
                  </button>
                </form>
              )}

              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {nextPayrollRecords.length === 0 ? (
                  <p className="text-center py-8 text-xs text-[#9E9E9E]">Nenhum registro pendente.</p>
                ) : (
                  <>
                    {nextPayrollRecords.slice((nextPayrollPage - 1) * 5, nextPayrollPage * 5).map((record) => (
                      <div key={record.id} className="p-3 bg-white border border-zinc-100 rounded-xl hover:border-zinc-200 transition-all group relative">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${record.occurrence === 'INCLUSÃO' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                            {record.occurrence}
                          </span>
                          {isSuperAdmin && (
                            <button 
                              onClick={() => deleteNextPayroll(record.id)}
                              className="text-zinc-300 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-sm font-medium text-black line-clamp-1">{record.name}</p>
                        <p className="text-xs font-mono text-[#9E9E9E]">{record.cpf}</p>
                        <p className="text-[9px] text-[#D1D1D1] mt-1">
                          Em {new Date(record.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    ))}

                    {nextPayrollRecords.length > 5 && (
                      <div className="flex items-center justify-between pt-4 pb-2 border-t border-zinc-100 mt-4">
                        <button
                          disabled={nextPayrollPage === 1}
                          onClick={() => setNextPayrollPage(prev => prev - 1)}
                          className="bg-zinc-100 text-[#9E9E9E] p-2 rounded-lg disabled:opacity-30 transition-all hover:bg-zinc-200"
                        >
                          <Plus className="w-4 h-4 rotate-45" />
                        </button>
                        <span className="text-[10px] font-bold text-[#9E9E9E] uppercase tracking-widest">
                          Página {nextPayrollPage} de {Math.ceil(nextPayrollRecords.length / 5)}
                        </span>
                        <button
                          disabled={nextPayrollPage === Math.ceil(nextPayrollRecords.length / 5)}
                          onClick={() => setNextPayrollPage(prev => prev + 1)}
                          className="bg-black text-white p-2 rounded-lg disabled:opacity-30 transition-all hover:bg-zinc-800"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        )}
  
        {/* Content Section */}
        <section className={view === 'users' || view === 'profile' || view === 'logs' ? 'lg:col-span-12' : 'lg:col-span-8'}>
          <AnimatePresence mode="wait">
            {view === 'dashboard' ? (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {/* Consulta por Mês - Prominent Card */}
                {isDirector && (
                  <div className="bg-white p-6 rounded-[24px] shadow-sm border border-zinc-100 mb-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-semibold uppercase tracking-widest text-black">Consulta de Valores por Mês</h2>
                        <p className="text-[10px] text-[#9E9E9E] uppercase tracking-wider">Valor Acumulado de Determinado Mês</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      <div className="w-full sm:w-64">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-[#9E9E9E] block mb-2">Selecionar Período</label>
                        <select 
                          className="w-full bg-zinc-50 border border-zinc-100 rounded-xl p-3 text-sm focus:ring-2 focus:ring-black outline-none transition-all"
                          value={queryPeriod ? `${queryPeriod.month}-${queryPeriod.year}` : ''}
                          onChange={(e) => {
                            if (!e.target.value) {
                              setQueryPeriod(null);
                              return;
                            }
                            const [month, year] = e.target.value.split('-').map(Number);
                            setQueryPeriod({ month, year });
                          }}
                        >
                          <option value="">Selecione um mês/ano...</option>
                          {getUniquePeriods().map(p => {
                            const monthNames = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                            return (
                              <option key={`${p.month}-${p.year}`} value={`${p.month}-${p.year}`}>
                                {monthNames[p.month]} / {p.year}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="flex-1 w-full">
                        <AnimatePresence mode="wait">
                          {querySummary ? (
                            <motion.div 
                              key="query-results"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="bg-zinc-50 rounded-2xl p-6 border border-zinc-100"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                  <h3 className="text-lg font-bold tracking-tight text-black">
                                    {querySummary.monthName} {querySummary.year}
                                  </h3>
                                  <p className="text-[10px] text-[#9E9E9E] uppercase font-medium">Consolidado de {querySummary.reportsCount} {querySummary.reportsCount === 1 ? 'arquivo' : 'arquivos'}</p>
                                </div>
                                <div className="flex gap-8">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-[#9E9E9E] uppercase tracking-widest mb-1">Associados</span>
                                    <span className="text-xl font-bold tracking-tighter">{querySummary.totalAssociates.toLocaleString('pt-BR')}</span>
                                  </div>
                                  {isDirector && (
                                    <div className="flex flex-col">
                                      <span className="text-[10px] font-bold text-[#9E9E9E] uppercase tracking-widest mb-1">Valor Total</span>
                                      <span className="text-xl font-bold tracking-tighter text-blue-600">
                                        {querySummary.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ) : (
                            <div className="h-full min-h-[90px] flex items-center justify-center border-2 border-dashed border-zinc-100 rounded-2xl p-4">
                              <p className="text-[11px] text-[#9E9E9E] uppercase tracking-widest font-medium">Escolha um mês para ver o somatório</p>
                            </div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-medium tracking-tight">Histórico de Listas</h2>
                  <div className="flex items-center gap-2 text-xs text-[#9E9E9E]">
                    <FolderOpen className="w-4 h-4" />
                    {reports.length} Arquivos
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Coluna Normal */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 px-2 pb-2 border-b border-zinc-200">
                      <div className="w-2 h-2 rounded-full bg-blue-600" />
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#9E9E9E]">Ativos e Aposentados</h3>
                      <span className="ml-auto text-[10px] font-medium bg-zinc-100 px-2 py-0.5 rounded-full text-[#9E9E9E]">
                        {reports.filter(r => r.category !== 'pensionista').length}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {reports.filter(r => r.category !== 'pensionista').slice((historyPage - 1) * 3, historyPage * 3).map(renderReportCard)}
                      {reports.filter(r => r.category !== 'pensionista').length === 0 && (
                        <div className="text-center py-12 bg-white/50 rounded-[24px] border border-dashed border-zinc-200">
                          <p className="text-xs text-[#9E9E9E]">Nenhuma lista de ativos/aposentados encontrada.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Coluna Pensionista */}
                  <div className="space-y-6">
                    <div className="flex items-center gap-2 px-2 pb-2 border-b border-zinc-200">
                      <div className="w-2 h-2 rounded-full bg-amber-600" />
                      <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[#9E9E9E]">Pensionistas</h3>
                      <span className="ml-auto text-[10px] font-medium bg-amber-50 px-2 py-0.5 rounded-full text-amber-600">
                        {reports.filter(r => r.category === 'pensionista').length}
                      </span>
                    </div>
                    <div className="space-y-4">
                      {reports.filter(r => r.category === 'pensionista').slice((historyPage - 1) * 3, historyPage * 3).map(renderReportCard)}
                      {reports.filter(r => r.category === 'pensionista').length === 0 && (
                        <div className="text-center py-12 bg-white/50 rounded-[24px] border border-dashed border-zinc-200">
                          <p className="text-xs text-[#9E9E9E]">Nenhuma lista de pensionistas encontrada.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pagination Controls */}
                {Math.max(
                  Math.ceil(reports.filter(r => r.category !== 'pensionista').length / 3),
                  Math.ceil(reports.filter(r => r.category === 'pensionista').length / 3)
                ) > 1 && (
                  <div className="flex items-center justify-center gap-4 pt-4 mt-6 border-t border-zinc-100">
                    <button 
                      onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                      disabled={historyPage === 1}
                      className="p-2 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-black px-3 py-1 bg-zinc-100 rounded-lg">Página {historyPage}</span>
                      <span className="text-[10px] uppercase font-bold text-[#9E9E9E] tracking-widest">de {
                        Math.max(
                          Math.ceil(reports.filter(r => r.category !== 'pensionista').length / 3),
                          Math.ceil(reports.filter(r => r.category === 'pensionista').length / 3)
                        )
                      }</span>
                    </div>
                    <button 
                      onClick={() => setHistoryPage(p => Math.min(Math.max(
                        Math.ceil(reports.filter(r => r.category !== 'pensionista').length / 3),
                        Math.ceil(reports.filter(r => r.category === 'pensionista').length / 3)
                      ), p + 1))}
                      disabled={historyPage >= Math.max(
                        Math.ceil(reports.filter(r => r.category !== 'pensionista').length / 3),
                        Math.ceil(reports.filter(r => r.category === 'pensionista').length / 3)
                      )}
                      className="p-2 rounded-xl hover:bg-zinc-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ArrowBigRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </motion.div>
            ) : view === 'users' ? (
              <motion.div 
                key="users"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setView('dashboard')}
                      className="p-3 bg-white text-[#9E9E9E] hover:text-black rounded-2xl border border-zinc-100 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-black text-white rounded-2xl">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-medium tracking-tight">Gestão de Usuários</h2>
                        <p className="text-xs text-[#9E9E9E]">Administre os acessos do sindicato</p>
                      </div>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {isCreatingUser && isDirector && (
                    <motion.form 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleCreateUser}
                      className="bg-white p-6 rounded-[24px] border border-zinc-100 shadow-sm space-y-4 overflow-hidden"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1 block px-1">E-mail de Acesso</label>
                          <input 
                            required
                            type="email"
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1 block px-1">Nome Completo</label>
                          <input 
                            required
                            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-sm"
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1 block px-1">Nível de Permissão</label>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => setNewUserRole('STAFF')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all ${newUserRole === 'STAFF' ? 'bg-black text-white border-black' : 'bg-transparent text-[#9E9E9E] border-zinc-200 hover:border-zinc-300'}`}
                          >
                            Funcionário
                          </button>
                          <button 
                            type="button"
                            onClick={() => setNewUserRole('DIRECTOR')}
                            className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all ${newUserRole === 'DIRECTOR' ? 'bg-black text-white border-black' : 'bg-transparent text-[#9E9E9E] border-zinc-200 hover:border-zinc-300'}`}
                          >
                            Diretoria
                          </button>
                          {isSuperAdmin && (
                            <button 
                               type="button"
                               onClick={() => setNewUserRole('SUPER_ADMIN')}
                               className={`flex-1 py-2.5 rounded-xl text-xs font-medium border transition-all ${newUserRole === 'SUPER_ADMIN' ? 'bg-black text-white border-black' : 'bg-transparent text-[#9E9E9E] border-zinc-200 hover:border-zinc-300'}`}
                            >
                              Super-Usuário
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button type="submit" className="flex-1 bg-black text-white py-3 rounded-xl text-sm font-medium hover:bg-zinc-800 transition-all">
                          Criar Usuário
                        </button>
                        <button type="button" onClick={() => setIsCreatingUser(false)} className="px-6 bg-zinc-100 text-black py-3 rounded-xl text-sm font-medium">
                          Cancelar
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>

                <div className="bg-white rounded-[24px] border border-zinc-100 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-100">
                          <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E]">Usuário</th>
                          <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E]">Papel</th>
                          <th className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map((u: any) => (
                          <tr key={u.id} className="border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                            <td className="p-4">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-500">
                                  <UserIcon className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium leading-none">{u.name}</p>
                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">
                                      {u.level || 'Funcionário'}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#9E9E9E] leading-loose">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-2">
                                  {u.role === 'SUPER_ADMIN' ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                                      <ShieldCheck className="w-3 h-3" />
                                      Super-Dono
                                    </span>
                                  ) : u.role === 'DIRECTOR' ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
                                      <Shield className="w-3 h-3" />
                                      Diretoria
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-full">
                                      <UserIcon className="w-3 h-3" />
                                      Funcionário
                                    </span>
                                  )}
                                  
                                  {u.is_authorized ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                                      <Check className="w-3 h-3" />
                                      Ativo
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                                      <X className="w-3 h-3" />
                                      Pendente
                                    </span>
                                  )}
                                </div>
                            </td>
                             <td className="p-4 text-right">
                               <div className="flex items-center justify-end gap-2">
                                 {/* Autorização toggle - Apenas Diretores/Admins */}
                                 {isDirector && (
                                   <button 
                                     onClick={() => updateUserAuthorization(u.id, !u.is_authorized)}
                                     className={`p-2 rounded-lg transition-colors ${u.is_authorized ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                                     title={u.is_authorized ? 'Bloquear Acesso' : 'Autorizar Acesso'}
                                   >
                                     {u.is_authorized ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                   </button>
                                 )}
 
                                  {/* Permissão de delegar para Diretoria: Supervisor ou Admin */}
                                 {isDirector && u.role === 'STAFF' && (
                                   <button 
                                     onClick={() => updateUserRole(u.id, 'DIRECTOR')}
                                     className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
                                     title="Tornar Diretoria"
                                   >
                                     <TrendingUp className="w-4 h-4" />
                                   </button>
                                 )}
 
                                 {/* Alterar Senha: Admin ou Próprio Usuário */}
                                 {(isSuperAdmin || u.id === user?.id) && (
                                   <button 
                                     onClick={() => {
                                       setPasswordTargetUserId(u.id);
                                       setIsChangingPassword(true);
                                     }}
                                     className="p-2 hover:bg-zinc-100 text-[#9E9E9E] hover:text-black rounded-lg transition-colors"
                                     title="Alterar Senha"
                                   >
                                     <Key className="w-4 h-4" />
                                   </button>
                                 )}
 
                                 {isDirector && u.email !== 'gliarte@gmail.com' ? (
                                   <button 
                                     onClick={() => deleteUser(u.id)}
                                     className="p-2 hover:bg-red-50 text-[#9E9E9E] hover:text-red-600 rounded-lg transition-colors"
                                     title="Excluir Usuário"
                                   >
                                     <Trash2 className="w-4 h-4" />
                                   </button>
                                 ) : u.email === 'gliarte@gmail.com' ? (
                                   <div className="p-2 text-zinc-300" title="Usuário Protegido">
                                     <ShieldAlert className="w-4 h-4" />
                                   </div>
                                 ) : null}
                               </div>
                             </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Modal de Alteração de Senha */}
                <AnimatePresence>
                  {isChangingPassword && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-white w-full max-w-md rounded-[32px] shadow-2xl overflow-hidden"
                      >
                        <form onSubmit={handleUpdatePassword} className="p-8">
                          <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-zinc-100 rounded-2xl">
                              <Key className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="text-xl font-bold">Alterar Senha</h3>
                              <p className="text-xs text-[#9E9E9E]">
                                {allUsers.find(u => u.id === passwordTargetUserId)?.name || allUsers.find(u => u.id === passwordTargetUserId)?.email || 'Usuário'}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <label className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1 block px-1">Nova Senha</label>
                              <input 
                                required
                                type="password"
                                autoComplete="new-password"
                                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-black/5 outline-none transition-all"
                                placeholder="Mínimo 6 caracteres"
                                value={newPasswordValue}
                                onChange={(e) => setNewPasswordValue(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="flex gap-3 mt-8">
                            <button 
                              type="button" 
                              onClick={() => {
                                setIsChangingPassword(false);
                                setPasswordTargetUserId(null);
                                setNewPasswordValue('');
                              }}
                              className="flex-1 px-6 py-3.5 bg-zinc-100 text-black rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all font-mono"
                            >
                              Cancelar
                            </button>
                            <button 
                              type="submit"
                              disabled={isUpdatingPassword}
                              className="flex-[2] px-6 py-3.5 bg-black text-white rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all shadow-lg shadow-black/10 disabled:opacity-50 font-mono"
                            >
                              {isUpdatingPassword ? 'Salvando...' : 'Confirmar'}
                            </button>
                          </div>
                        </form>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : view === 'logs' && isSuperAdmin ? (
              <motion.div 
                key="logs"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setView('dashboard')}
                      className="p-3 bg-white text-[#9E9E9E] hover:text-black rounded-2xl border border-zinc-100 transition-colors"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h2 className="text-2xl font-medium tracking-tight">Logs do Sistema</h2>
                      <p className="text-xs text-[#9E9E9E]">Histórico de atividades e auditoria</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={exportLogsToTxt}
                      className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-full hover:bg-zinc-800 transition-all text-xs font-bold uppercase tracking-widest shadow-lg shadow-black/10"
                    >
                      <Download className="w-4 h-4" /> Exportar .TXT
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-[32px] shadow-sm border border-zinc-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50/50 border-b border-zinc-100">
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E]">Data/Hora</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E]">Usuário</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E]">Ação</th>
                          <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E]">Detalhes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50">
                        {systemLogs.length > 0 ? (
                          systemLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="px-6 py-4 text-xs font-medium whitespace-nowrap">
                                {new Date(log.created_at).toLocaleString('pt-BR')}
                              </td>
                              <td className="px-6 py-4 text-xs font-medium">
                                {log.user_email}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 bg-zinc-100 rounded-full text-zinc-700">
                                  {log.action}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-xs text-[#9E9E9E] whitespace-pre-wrap max-w-sm">
                                {log.details || '-'}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="px-6 py-12 text-center text-sm text-[#9E9E9E]">
                              Nenhum log encontrado.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : view === 'profile' ? (
              <motion.div 
                key="profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3">
                   <button 
                    onClick={() => setView('dashboard')}
                    className="p-3 bg-white text-[#9E9E9E] hover:text-black rounded-2xl border border-zinc-100 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <h2 className="text-2xl font-medium tracking-tight">Meu Perfil</h2>
                    <p className="text-xs text-[#9E9E9E]">Suas informações no sistema</p>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-[32px] border border-zinc-100 shadow-sm">
                  <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-8 pb-8 border-b border-zinc-50">
                    <div className="relative group">
                      <div className="w-32 h-32 bg-zinc-100 rounded-[40px] flex items-center justify-center text-zinc-400 overflow-hidden border-4 border-white shadow-xl relative">
                        {profile?.avatar_url ? (
                          <Image 
                            src={profile.avatar_url} 
                            alt="Avatar" 
                            fill 
                            className="object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <UserIcon className="w-12 h-12" />
                        )}
                        {isUpdatingProfile && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          </div>
                        )}
                      </div>
                      <label className="absolute -bottom-2 -right-2 bg-black text-white p-2.5 rounded-2xl cursor-pointer hover:scale-110 transition-all shadow-lg border-2 border-white">
                        <Upload className="w-4 h-4" />
                        <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
                      </label>
                    </div>
                    
                    <div className="flex-1 text-center md:text-left">
                      <h3 className="text-3xl font-bold tracking-tight mb-1">{profile?.name || user?.email || 'Usuário'}</h3>
                      <p className="text-[#9E9E9E]">{user?.email}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1">Informações de Acesso</p>
                        <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                          <p className="text-xs text-[#9E9E9E] mb-1 px-1">Método de Login</p>
                          <p className="text-sm font-medium px-1">{(user?.app_metadata as any)?.provider === 'google' ? 'Google' : 'E-mail e Senha'}</p>
                        </div>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] mb-1">Data de Ingresso</p>
                        <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                           <p className="text-sm font-medium px-1">
                             {profile?.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : 'Informação não disponível'}
                           </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-zinc-900 p-8 rounded-[24px] text-white flex flex-col justify-center items-center text-center">
                       <div className="mb-6">
                         <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                           <LogOut className="w-6 h-6 text-white" />
                         </div>
                         <h4 className="text-lg font-bold mb-1">Deseja sair?</h4>
                         <p className="text-sm text-zinc-400">Você precisará fazer login novamente para acessar o sistema.</p>
                       </div>
                       <button 
                        onClick={handleLogout}
                        className="w-full py-4 bg-red-600 text-white rounded-2xl text-sm font-bold uppercase tracking-widest hover:bg-red-700 transition-all shadow-lg shadow-red-900/20"
                       >
                         Encerrar Sessão
                       </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : view === 'report-details' ? (
              <motion.div 
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                {(() => {
                  const currentReport = reports.find(r => r.id === selectedReportId);
                  const isPensionista = currentReport?.category === 'pensionista';
                  
                  return (
                    <>
                      <div className="print-only mb-8 text-center border-b pb-4">
                        <h1 className="text-2xl font-bold uppercase">SINTUFPI - Gestor de Associados</h1>
                        <h2 className="text-xl mt-2">Relatório: {currentReport?.filename}</h2>
                        <p className="text-sm text-zinc-500 mt-1">Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <button 
                            onClick={() => setView('dashboard')}
                            className="p-2 hover:bg-zinc-100 rounded-full transition-colors no-print"
                          >
                            <ArrowLeft className="w-5 h-5" />
                          </button>
                          <div>
                            <h2 className="text-xl font-bold tracking-tight">Detalhes do Relatório</h2>
                            <p className="text-xs text-[#9E9E9E]">
                              {currentReport?.filename || 'Arquivo não encontrado'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 ml-4 no-print">
                            <button 
                              onClick={handleExportReportDetails}
                              className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-xs font-bold uppercase tracking-widest text-[#9E9E9E] hover:text-black hover:bg-zinc-100 rounded-xl transition-all border border-zinc-100"
                              title="Exportar PDF"
                            >
                              <FileText className="w-4 h-4" /> PDF
                            </button>
                            <button 
                              onClick={handlePrint}
                              className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-xs font-bold uppercase tracking-widest text-[#9E9E9E] hover:text-black hover:bg-zinc-100 rounded-xl transition-all border border-zinc-100"
                              title="Imprimir"
                            >
                              <Printer className="w-4 h-4" /> Imprimir
                            </button>
                          </div>
                        </div>

                        <div className="relative flex-1 max-w-md">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input 
                            type="text"
                            placeholder="Buscar por nome, SIAPE, CPF ou contrato..."
                            className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="bg-white rounded-[24px] overflow-hidden border border-zinc-100 shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                              <tr className="bg-zinc-50 border-bottom border-zinc-100">
                                {isPensionista ? (
                                  <>
                                    <th onClick={() => handleSort('siape')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                      <div className="flex items-center gap-1">
                                        SIAPE 1 {sortConfig.key === 'siape' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                      </div>
                                    </th>
                                    <th onClick={() => handleSort('siape2')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                      <div className="flex items-center gap-1">
                                        SIAPE 2 {sortConfig.key === 'siape2' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                      </div>
                                    </th>
                                  </>
                                ) : (
                                  <th onClick={() => handleSort('siape')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                    <div className="flex items-center gap-1">
                                      SIAPE {sortConfig.key === 'siape' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                    </div>
                                  </th>
                                )}
                                <th onClick={() => handleSort('name')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                  <div className="flex items-center gap-1">
                                    Nome {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                  </div>
                                </th>
                                <th onClick={() => handleSort('cpf')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                  <div className="flex items-center gap-1">
                                    CPF {sortConfig.key === 'cpf' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                  </div>
                                </th>
                                {isStaff && (
                                  <th onClick={() => handleSort('value')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                    <div className="flex items-center gap-1">
                                      Valor (R$) {sortConfig.key === 'value' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                    </div>
                                  </th>
                                )}
                                <th onClick={() => handleSort('contract')} className="p-4 text-[10px] font-bold uppercase tracking-widest text-[#9E9E9E] cursor-pointer hover:bg-zinc-100 transition-colors group">
                                  <div className="flex items-center gap-1">
                                    Contrato {sortConfig.key === 'contract' && (sortConfig.direction === 'asc' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
                                  </div>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {isActionLoading ? (
                                <tr>
                                  <td colSpan={isPensionista ? (isStaff ? 6 : 5) : (isStaff ? 5 : 4)} className="p-8 text-center bg-white">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto"></div>
                                  </td>
                                </tr>
                              ) : getProcessedAssociates(detailedAssociates).map((associate) => (
                                <tr key={associate.id} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                                  {isPensionista ? (
                                    <>
                                      <td className="p-4 text-xs font-mono">{associate.siape || '---'}</td>
                                      <td className="p-4 text-xs font-mono">{associate.siape2 || '---'}</td>
                                    </>
                                  ) : (
                                    <td className="p-4 text-xs font-mono">{associate.siape || '---'}</td>
                                  )}
                                  <td className="p-4 text-sm font-medium">{associate.name}</td>
                                  <td className="p-4 text-xs font-mono">{associate.cpf}</td>
                                  {isStaff && (
                                    <td className="p-4 text-sm font-mono">
                                      {associate.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                  )}
                                  <td className="p-4 text-xs font-mono">{associate.contract || '---'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </motion.div>
            ) : (
              <motion.div 
                key="comparison"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="print-only mb-8 text-center border-b pb-4 w-full">
                    <h1 className="text-2xl font-bold uppercase">SINTUFPI - Gestor de Associados</h1>
                    <h2 className="text-xl mt-2">Relatório: {diffType === 'included' ? 'Filiações' : 'Desfiliações'}</h2>
                    <p className="text-sm text-zinc-500 mt-1">Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setView('dashboard')}
                      className="p-2 hover:bg-zinc-100 rounded-full transition-colors no-print"
                    >
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h2 className="text-xl font-bold tracking-tight">
                        {diffType === 'included' ? 'Filiações' : 'Desfiliações'}
                      </h2>
                      <p className="text-xs text-[#9E9E9E]">Comparação de listas</p>
                    </div>

                    <div className="flex items-center gap-2 ml-4 no-print">
                      <button 
                        onClick={handleExportComparison}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-xs font-bold uppercase tracking-widest text-[#9E9E9E] hover:text-black hover:bg-zinc-100 rounded-xl transition-all border border-zinc-100"
                      >
                        <FileText className="w-4 h-4" /> PDF
                      </button>
                      <button 
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-3 py-2 bg-zinc-50 text-xs font-bold uppercase tracking-widest text-[#9E9E9E] hover:text-black hover:bg-zinc-100 rounded-xl transition-all border border-zinc-100"
                      >
                        <Printer className="w-4 h-4" /> Imprimir
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-1 max-w-md">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                      <input 
                        type="text"
                        placeholder="Buscar por nome..."
                        className="w-full pl-10 pr-4 py-2 bg-zinc-50 border border-zinc-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${diffType === 'included' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {diffResults.length} Total
                      </div>
                      {isDirector && (
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          Total: {diffResults.reduce((acc, r) => acc + (r.value || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[24px] overflow-hidden border border-zinc-100 shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                      <thead>
                        <tr className="bg-zinc-50 border-bottom border-zinc-100">
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">SIAPE</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">Nome do Associado</th>
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">CPF</th>
                          {isStaff && <th className="p-4 text-xs font-bold uppercase tracking-widest text-[#9E9E9E] text-right">Valor</th>}
                          <th className="p-4 text-xs font-bold uppercase tracking-widest text-[#9E9E9E]">Contrato</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isComparing ? (
                          <tr>
                            <td colSpan={isStaff ? 5 : 4} className="p-8 text-center bg-white">
                              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto"></div>
                              <p className="text-xs mt-4">Comparando dados...</p>
                            </td>
                          </tr>
                        ) : (
                          <>
                            {diffResults.filter(r => !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase())).map((record, i) => (
                              <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50 transition-colors">
                                <td className="p-4 text-xs font-mono">{record.siape} {record.siape2 ? `/ ${record.siape2}` : ''}</td>
                                <td className="p-4 text-sm font-medium">{record.name}</td>
                                <td className="p-4 text-xs font-mono">{record.cpf}</td>
                                {isStaff && (
                                  <td className="p-4 text-sm text-right font-mono tracking-tight">
                                    R$ {record.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </td>
                                )}
                                <td className="p-4 text-xs font-mono">{record.contract || '---'}</td>
                              </tr>
                            ))}
                            {diffResults.length > 0 && !searchTerm && (
                              <tr className="bg-zinc-50/50">
                                <td colSpan={isStaff ? 3 : 2} className="p-4 text-sm font-bold text-right text-zinc-500 uppercase tracking-wider">Total Acumulado</td>
                                <td className="p-4 text-sm text-right font-bold font-mono tracking-tight text-black">
                                  {diffResults.reduce((acc, r) => acc + (r.value || 0), 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </td>
                                <td></td>
                              </tr>
                            )}
                          </>
                        )}
                        {!isComparing && diffResults.length === 0 && (
                          <tr>
                            <td colSpan={isStaff ? 5 : 4} className="p-12 text-center text-[#9E9E9E]">
                              Nenhuma diferença encontrada entre as listas.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </main>

      {/* Footer Meta */}
      <footer className="max-w-7xl mx-auto px-8 py-8 border-t border-zinc-200 mt-6 flex flex-col md:flex-row justify-between gap-4 no-print">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-50">Sobre o Sistema</p>
          <p className="text-sm text-[#9E9E9E] max-w-sm">
            Ferramenta desenvolvida para auditoria e controle de mensalidades associativas através de processamento de arquivos.
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-50">Créditos de Desenvolvimento</p>
          <div className="text-sm text-[#9E9E9E]">
            <p>Desenvolvedor: <span className="text-black font-medium">Gustavo Liarte</span></p>
            <p>E-Mail: <span className="text-black font-medium">gliarte@gmail.com</span></p>
            <p className="mt-2 text-[10px] uppercase font-bold tracking-tight">De uso exclusivo do SINTUFPI até o término do contrato</p>
            <p className="text-[10px] opacity-75">Todos os direitos reservados!</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-widest mb-2 opacity-50">Localização do Servidor</p>
          <p className="text-sm text-[#9E9E9E]">Região: us-east1 (Iowa)</p>
        </div>
      </footer>
    </div>
  );
}
