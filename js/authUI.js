import { onAuthChange, signInWithGoogle, signInWithMagicLink, signOut, getProfile } from './auth.js';

// Spina logowanie z UI: przycisk konta w nagłówku, menu zalogowanego oraz modal
// z Google + linkiem e-mail. Reszta aplikacji nie musi wiedzieć o szczegółach.
export function setupAuthUI() {
    const accountBtn = document.getElementById('account-btn');
    const accountMenu = document.getElementById('account-menu');
    const accountName = document.getElementById('account-name');
    const accountLevel = document.getElementById('account-level');
    const logoutBtn = document.getElementById('logout-btn');

    const modal = document.getElementById('auth-modal');
    const modalClose = document.getElementById('auth-modal-close');
    const googleBtn = document.getElementById('google-btn');
    const magicForm = document.getElementById('magic-form');
    const magicEmail = /** @type {HTMLInputElement} */ (document.getElementById('magic-email'));
    const authMsg = document.getElementById('auth-msg');

    let currentUser = null;

    const openModal = () => {
        authMsg.textContent = '';
        modal.classList.remove('hidden');
        magicEmail.focus();
    };
    const closeModal = () => modal.classList.add('hidden');
    const closeMenu = () => accountMenu.classList.add('hidden');

    accountBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (currentUser) {
            accountMenu.classList.toggle('hidden');
        } else {
            openModal();
        }
    });

    // Klik poza menu je zamyka.
    document.addEventListener('click', event => {
        if (!accountMenu.contains(event.target) && event.target !== accountBtn) {
            closeMenu();
        }
    });

    modalClose.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            closeModal();
        }
    });

    googleBtn.addEventListener('click', async () => {
        authMsg.textContent = 'Przekierowuję do Google…';
        const { error } = await signInWithGoogle();
        if (error) {
            authMsg.textContent = `Błąd logowania Google: ${error.message}`;
        }
    });

    magicForm.addEventListener('submit', async event => {
        event.preventDefault();
        authMsg.textContent = 'Wysyłam link…';
        const { error } = await signInWithMagicLink(magicEmail.value.trim());
        authMsg.textContent = error
            ? `Nie udało się wysłać: ${error.message}`
            : 'Sprawdź skrzynkę — wysłaliśmy link do zalogowania.';
    });

    logoutBtn.addEventListener('click', async () => {
        closeMenu();
        await signOut();
    });

    onAuthChange(async user => {
        currentUser = user;
        if (user) {
            closeModal();
            accountBtn.textContent = '…';
            const profile = await getProfile(user.id);
            const name = profile?.display_name || user.email || 'Konto';
            accountBtn.textContent = name;
            accountName.textContent = name;
            accountLevel.textContent = profile ? `Poziom ${profile.level} · ${profile.xp} EXP` : '';
        } else {
            closeMenu();
            accountBtn.textContent = 'Zaloguj';
            accountName.textContent = '';
            accountLevel.textContent = '';
        }
    });
}
