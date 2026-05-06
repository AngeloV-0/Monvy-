// ==============================
// MONVY — FIREBASE INTEGRATION
// v11.6.0 | tag <script> mode
// ==============================

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile,
  setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_xar1S5zCb5WEg814btkj4vwwcGGmQt4",
  authDomain: "monvy-5969f.firebaseapp.com",  // domínio Firebase (evita 404 no iframe de auth)
  projectId: "monvy-5969f",
  storageBucket: "monvy-5969f.firebasestorage.app",
  messagingSenderId: "373157570069",
  appId: "1:373157570069:web:debf59f8352d181ffc901c"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Persistência configurada em paralelo — não bloqueia a inicialização
setPersistence(auth, browserLocalPersistence)
  .catch(e => console.warn('Persistence error:', e));

// waitAuthReady agora é instantâneo — auth já está pronto após initializeApp
export async function waitAuthReady() { return Promise.resolve(); }

// ── Auth ──────────────────────────────────────────────────────

export async function loginComGoogle() {
  await authReady;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    // Salva flag para o redirect não confundir com novo usuário
    try { sessionStorage.setItem('monvy_google_redirect', '1'); } catch(_) {}
    await signInWithRedirect(auth, googleProvider);
    return;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await _garantirPerfil(result.user);
    return result.user;
  } catch (e) {
    // Popup bloqueado: cai para redirect
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      try { sessionStorage.setItem('monvy_google_redirect', '1'); } catch(_) {}
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    throw e;
  }
}

// Captura o resultado do redirect (chamado no carregamento da página)
export async function verificarRedirectGoogle() {
  await authReady;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      await _garantirPerfil(result.user);
      return result.user;
    }
  } catch (e) {
    console.error('Erro no redirect Google:', e);
  }
  return null;
}

export async function loginComEmail(email, senha) {
  await authReady;
  const result = await signInWithEmailAndPassword(auth, email, senha);
  return result.user;
}

export async function cadastrarComEmail(nome, email, senha) {
  await authReady;
  const result = await createUserWithEmailAndPassword(auth, email, senha);
  await updateProfile(result.user, { displayName: nome });
  await _garantirPerfil(result.user, nome);
  return result.user;
}

export async function enviarResetSenha(email) {
  const actionCodeSettings = {
    url: 'https://monvay.com.br/auth.html',
    handleCodeInApp: false
  };
  await sendPasswordResetEmail(auth, email, actionCodeSettings);
}

export async function fazerLogout() {
  await signOut(auth);
}

export function onAuth(cb) { return onAuthStateChanged(auth, cb); }
export function usuarioAtual() { return auth.currentUser; }

async function _garantirPerfil(user, nomeOverride) {
  const ref  = doc(db, 'usuarios', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      nome: nomeOverride || user.displayName || 'Usuário',
      email: user.email,
      foto: user.photoURL || null,
      criadoEm: serverTimestamp(),
      onboardingDone: false,
      perfilVida: {}
    });
  }
}

// ── Perfil ────────────────────────────────────────────────────

export async function getPerfil(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid));
  return snap.exists() ? snap.data() : {};
}

export async function salvarPerfil(uid, dados) {
  await updateDoc(doc(db, 'usuarios', uid), dados);
}

export async function salvarPerfilVida(uid, perfil) {
  await updateDoc(doc(db, 'usuarios', uid), { perfilVida: perfil });
}

export async function marcarOnboardingFeito(uid) {
  await updateDoc(doc(db, 'usuarios', uid), { onboardingDone: true });
}

// ── Movimentações ─────────────────────────────────────────────

export async function getMovimentacoes(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'movimentacoes'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if (a.data !== b.data) return (b.data || '').localeCompare(a.data || '');
      const ta = a.criadoEm?.toMillis?.() || 0;
      const tb = b.criadoEm?.toMillis?.() || 0;
      return tb - ta;
    });
}

export async function adicionarMovimentacao(uid, mov) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'movimentacoes'), {
    ...mov, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarMovimentacao(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'movimentacoes', id), dados);
}

export async function deletarMovimentacao(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'movimentacoes', id));
}

export function ouvirMovimentacoes(uid, callback) {
  return onSnapshot(collection(db, 'usuarios', uid, 'movimentacoes'), snap => {
    const movs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (a.data !== b.data) return (b.data || '').localeCompare(a.data || '');
        const ta = a.criadoEm?.toMillis?.() || 0;
        const tb = b.criadoEm?.toMillis?.() || 0;
        return tb - ta;
      });
    callback(movs);
  });
}

// ── Metas ─────────────────────────────────────────────────────

export async function getMetas(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'metas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adicionarMeta(uid, meta) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'metas'), {
    ...meta, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarMeta(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'metas', id), dados);
}

export async function deletarMeta(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'metas', id));
}

// ── Dívidas ───────────────────────────────────────────────────

export async function getDividas(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'dividas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adicionarDivida(uid, divida) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'dividas'), {
    ...divida, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarDivida(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'dividas', id), dados);
}

export async function deletarDivida(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'dividas', id));
}

export { auth, db };

// ── Contas a Pagar ────────────────────────────────────────────

export async function getContas(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'contas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adicionarConta(uid, conta) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'contas'), {
    ...conta, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarConta(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'contas', id), dados);
}

export async function deletarConta(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'contas', id));
}

// ── Reset Mensal ──────────────────────────────────────────────

export async function verificarEResetarMes(uid) {
  const agora = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

  const perfilRef = doc(db, 'usuarios', uid);
  const perfilSnap = await getDoc(perfilRef);
  const perfil = perfilSnap.data() || {};
  const ultimoMes = perfil.ultimoMesAtivo || null;

  // Se já está no mesmo mês, nada a fazer
  if (ultimoMes === mesAtual) return false;

  // É um mês novo — arquivar movimentações do mês anterior
  if (ultimoMes) {
    const movsSnap = await getDocs(collection(db, 'usuarios', uid, 'movimentacoes'));
    const movs = movsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (movs.length > 0) {
      // Calcular totais do mês encerrado
      const entradas = movs.filter(m => m.tipo === 'ganho').reduce((s, m) => s + (m.valor || 0), 0);
      const saidas = movs.filter(m => m.tipo === 'gasto').reduce((s, m) => s + (m.valor || 0), 0);

      // Salvar resumo no histórico
      await setDoc(doc(db, 'usuarios', uid, 'historico', ultimoMes), {
        mes: ultimoMes,
        entradas,
        saidas,
        saldo: entradas - saidas,
        totalMovimentacoes: movs.length,
        movimentacoes: movs.map(m => ({
          descricao: m.descricao || '',
          valor: m.valor || 0,
          tipo: m.tipo || '',
          categoria: m.categoria || '',
          data: m.data || '',
        })),
        arquivadoEm: serverTimestamp()
      });

      // Deletar todas as movimentações atuais
      for (const d of movsSnap.docs) {
        await deleteDoc(doc(db, 'usuarios', uid, 'movimentacoes', d.id));
      }
    }
  }

  // Atualizar o mês ativo no perfil
  await updateDoc(perfilRef, { ultimoMesAtivo: mesAtual });
  return true; // indica que houve reset
}

export async function getHistorico(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'historico'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.mes.localeCompare(a.mes));
}

// ── Modo Empresa ───────────────────────────────────────────────

export async function getEmpresa(uid) {
  const snap = await getDoc(doc(db, 'usuarios', uid, 'empresa', 'perfil'));
  return snap.exists() ? snap.data() : null;
}

export async function salvarEmpresa(uid, dados) {
  await setDoc(doc(db, 'usuarios', uid, 'empresa', 'perfil'), {
    ...dados,
    atualizadoEm: serverTimestamp()
  }, { merge: true });
}

// Movimentações da empresa (separadas das pessoais)
export async function getMovimentacoesEmpresa(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'empresa_movs'));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      if (a.data !== b.data) return (b.data || '').localeCompare(a.data || '');
      const ta = a.criadoEm?.toMillis?.() || 0;
      const tb = b.criadoEm?.toMillis?.() || 0;
      return tb - ta;
    });
}

export async function adicionarMovimentacaoEmpresa(uid, mov) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'empresa_movs'), {
    ...mov, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarMovimentacaoEmpresa(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'empresa_movs', id), dados);
}

export async function deletarMovimentacaoEmpresa(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'empresa_movs', id));
}

export function ouvirMovimentacoesEmpresa(uid, callback) {
  return onSnapshot(collection(db, 'usuarios', uid, 'empresa_movs'), snap => {
    const movs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        if (a.data !== b.data) return (b.data || '').localeCompare(a.data || '');
        const ta = a.criadoEm?.toMillis?.() || 0;
        const tb = b.criadoEm?.toMillis?.() || 0;
        return tb - ta;
      });
    callback(movs);
  });
}

// Produtos da empresa
export async function getProdutos(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'empresa_produtos'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adicionarProduto(uid, produto) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'empresa_produtos'), {
    ...produto, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarProduto(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'empresa_produtos', id), dados);
}

export async function deletarProduto(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'empresa_produtos', id));
}

// Contas empresa (a pagar/receber)
export async function getContasEmpresa(uid) {
  const snap = await getDocs(collection(db, 'usuarios', uid, 'empresa_contas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function adicionarContaEmpresa(uid, conta) {
  const ref = await addDoc(collection(db, 'usuarios', uid, 'empresa_contas'), {
    ...conta, criadoEm: serverTimestamp()
  });
  return ref.id;
}

export async function atualizarContaEmpresa(uid, id, dados) {
  await updateDoc(doc(db, 'usuarios', uid, 'empresa_contas', id), dados);
}

export async function deletarContaEmpresa(uid, id) {
  await deleteDoc(doc(db, 'usuarios', uid, 'empresa_contas', id));
}
