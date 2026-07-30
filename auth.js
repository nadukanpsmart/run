// Auth State
var authState = {
    user: null,
    owner: null,
    signup: {
        email: '',
        pass: '',
        confPass: '',
        otpSent: false,
        devOtpSent: false,
        emailVerified: false,
        devVerified: false
    }
};
window.authState = authState;

// ==========================================
// AUTHENTICATION LOGIC
// ==========================================

// Check Initial Session
window.addEventListener('DOMContentLoaded', async () => {
    // We already have DOMContentLoaded in app.js, this is fine as it's sequential or mixed
    // Actually, duplication of listener might be messy if app.js is single file.
    // I should merge this into existing app.js logic or appended.
    // Assuming this block is appended to app.js via tool.
});

async function checkSession() {
    // Check Supabase session first for actual authentication
    const { data: { session } } = await supabase.auth.getSession();
    const localUser = localStorage.getItem('tenant_session');

    if (session && localUser) {
        const user = JSON.parse(localUser);
        authState.owner = user;
        showApp();
    } else {
        localStorage.removeItem('tenant_session');
        showAuth();
    }
}

function showAuth() {
    document.getElementById('auth-wrapper').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
}

async function showApp() {
    document.getElementById('auth-wrapper').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    // Permission Check
    if (authState.owner) {
        // Nav Buttons
        const navButtons = document.querySelectorAll('.nav-btn');
        let invBtn = null, analysisBtn = null, empBtn = null;
        navButtons.forEach(btn => {
            if (btn.textContent.includes('Inventory')) invBtn = btn;
            if (btn.textContent.includes('Data Analysis')) analysisBtn = btn;
            if (btn.textContent.includes('Employees')) empBtn = btn;
        });

        // Drawer Buttons
        const drawerAnalysis = document.getElementById('drawer-link-analysis');
        const drawerEmployees = document.getElementById('drawer-link-employees');
        const drawerInventory = document.getElementById('drawer-link-inventory');

        if (authState.owner.role === 'employee') {
            // Hide Inventory & Employees (Desktop & Mobile)
            if (invBtn) invBtn.style.display = 'none';
            if (empBtn) empBtn.style.display = 'none';
            if (drawerInventory) drawerInventory.style.display = 'none';
            if (drawerEmployees) drawerEmployees.style.display = 'none';

            // Check Analysis Permission (Fetch Owner Config)
            const { data: ownerReq } = await supabase
                .from('owners')
                .select('allow_employee_analysis, preferred_store_name, business_name, preferred_logo, preferred_address, business_address, bill_note')
                .eq('tenant_id', authState.owner.tenant_id)
                .eq('role', 'owner')
                .maybeSingle();

            let allowAnalysis = false;
            if (ownerReq) {
                if (ownerReq.allow_employee_analysis) allowAnalysis = true;
                // Cache Branding
                if (window.appState) {
                    window.appState.ownerPreferredName = ownerReq.preferred_store_name || ownerReq.business_name || "Na Dukan";
                    if (ownerReq.preferred_logo) {
                        window.appState.ownerPreferredLogo = ownerReq.preferred_logo;
                    }
                    // Cache Address & Note
                    window.appState.ownerPreferredAddress = ownerReq.preferred_address || ownerReq.business_address || "";
                    window.appState.ownerBillNote = ownerReq.bill_note || "";

                    // Persist Cache for Reloads
                    const prefCache = {
                        name: window.appState.ownerPreferredName,
                        logo: window.appState.ownerPreferredLogo,
                        address: window.appState.ownerPreferredAddress,
                        note: window.appState.ownerBillNote
                    };
                    localStorage.setItem('owner_pref_cache', JSON.stringify(prefCache));

                    // Force update UI immediately if function available
                    if (window.updateBranding) window.updateBranding();
                }
            }

            if (analysisBtn) analysisBtn.style.display = allowAnalysis ? 'inline-block' : 'none';
            if (drawerAnalysis) drawerAnalysis.style.display = allowAnalysis ? 'block' : 'none';

        } else {
            // Owner: Show All (Desktop)
            if (invBtn) invBtn.style.display = 'inline-block';
            if (analysisBtn) analysisBtn.style.display = 'inline-block';
            if (empBtn) empBtn.style.display = 'inline-block';

            // Owner: Show All (Mobile)
            if (drawerInventory) drawerInventory.style.display = 'block';
            if (drawerAnalysis) drawerAnalysis.style.display = 'block';
            if (drawerEmployees) drawerEmployees.style.display = 'block';

            // FIX: Fetch fresh owner data from DB so logo/note/address are always up-to-date
            // (localStorage may be stale if saved from another device)
            if (authState.owner && authState.owner.id) {
                try {
                    const { data: freshOwner } = await supabase
                        .from('owners')
                        .select('preferred_store_name, business_name, preferred_logo, preferred_address, business_address, bill_note')
                        .eq('id', authState.owner.id)
                        .maybeSingle();

                    if (freshOwner) {
                        // Merge fresh data into authState.owner and localStorage
                        authState.owner.preferred_store_name = freshOwner.preferred_store_name || authState.owner.preferred_store_name;
                        authState.owner.preferred_logo = freshOwner.preferred_logo || authState.owner.preferred_logo;
                        authState.owner.preferred_address = freshOwner.preferred_address || authState.owner.preferred_address;
                        authState.owner.bill_note = freshOwner.bill_note !== undefined ? freshOwner.bill_note : authState.owner.bill_note;
                        localStorage.setItem('tenant_session', JSON.stringify(authState.owner));

                        // Also update appState cache so bill previews use fresh data
                        if (window.appState) {
                            window.appState.ownerPreferredName = freshOwner.preferred_store_name || freshOwner.business_name || authState.owner.business_name || 'Na Dukan';
                            window.appState.ownerPreferredLogo = freshOwner.preferred_logo || null;
                            window.appState.ownerPreferredAddress = freshOwner.preferred_address || freshOwner.business_address || '';
                            window.appState.ownerBillNote = freshOwner.bill_note || '';

                            // Persist to cache
                            localStorage.setItem('owner_pref_cache', JSON.stringify({
                                name: window.appState.ownerPreferredName,
                                logo: window.appState.ownerPreferredLogo,
                                address: window.appState.ownerPreferredAddress,
                                note: window.appState.ownerBillNote
                            }));
                        }
                    }
                } catch (e) {
                    console.warn('[Auth] Could not refresh owner profile from DB:', e);
                }
            }
        }
    }

    // Load data
    if (window.updateBranding) window.updateBranding();
    loadInventory();
    loadDashboard('today');

    // FIX: Start global sales realtime listener so new bills from ANY device update the UI live
    startSalesRealtime();
}

// Toggle Views
function showSignup() {
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('signup-view').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('signup-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
}

// LOGIN
async function handleLogin() {

    if (!window.supabase) {
        alert("System Error: Database connection not initialized. Please refresh.");
        return;
    }

    try {
        const identifier = document.getElementById('login-identifier').value.trim(); // Email or Phone
        const password = document.getElementById('login-password').value;

        if (!identifier || !password) {
            alert("Please enter Email/Phone and Password");
            return;
        }

        let emailToLogin = identifier;

        // Check if input is likely a phone number (no @ symbol)
        if (!identifier.includes('@')) {
            // Lookup email using phone number
            const { data: owner, error } = await supabase
                .from('owners')
                .select('email')
                .eq('phone', identifier)
                .maybeSingle();

            if (error) {
                alert("Error searching for phone number: " + error.message + "\n\n(RLS Policy might be blocking access)");
                return;
            }
            if (!owner) {
                alert("Phone number not found. Please register or use Email.");
                return;
            }
            emailToLogin = owner.email;
        }

        // Step C: Authenticate with Supabase (Email + Password)
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: emailToLogin,
            password: password
        });

        if (authError) {
            alert("Login Failed: " + authError.message);
            return;
        }

        // Success - Fetch Owner Profile
        const { data: ownerProfile, error: profileError } = await supabase
            .from('owners')
            .select('*')
            .eq('id', authData.user.id)
            .single();

        if (profileError || !ownerProfile) {
            alert("Login successful but failed to load profile data.\nError: " + profileError.message + "\n\n(Check 'owners' table RLS policies)");
            return;
        }

        localStorage.setItem('tenant_session', JSON.stringify(ownerProfile));
        authState.owner = ownerProfile;

        // Employee Logging
        if (ownerProfile.role === 'employee') {
            // 1. Close any abandoned 'Active' sessions for this specific employee
            try {
                await supabase
                    .from('employee_logs')
                    .update({ logout_time: new Date().toISOString() })
                    .eq('employee_id', ownerProfile.id)
                    .is('logout_time', null);
            } catch (e) {
                console.warn("Failed to clean up old sessions:", e);
            }

            // 2. Start new session
            const { data: logData, error: logError } = await supabase
                .from('employee_logs')
                .insert([{
                    employee_id: ownerProfile.id,
                    tenant_id: ownerProfile.tenant_id
                }])
                .select()
                .single();

            if (logData) {
                localStorage.setItem('employee_log_id', logData.id);
            }
        }

        showApp();
    } catch (err) {
        alert("An unexpected error occurred: " + err.message);
    }
}

// SIGNUP FLOW

// Step 1: Verify Email & Pass logic
async function initiateSignup() {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!email || !pass) {
        alert("Please fill in credentials");
        return;
    }
    if (pass !== confirm) {
        alert("Passwords do not match");
        return;
    }
    if (pass.length < 6) {
        alert("Password must be at least 6 characters");
        return;
    }

    authState.signup.email = email;
    authState.signup.pass = pass;

    // Generate Mock OTP
    const mockOtp = Math.floor(100000 + Math.random() * 900000).toString();
    authState.signup.mockOtp = mockOtp;

    // Proceed to OTP step
    document.getElementById('signup-step-1').classList.add('hidden');
    document.getElementById('signup-step-otp').classList.remove('hidden');

    const otpMsgEl = document.querySelector('#signup-step-otp p');
    if (otpMsgEl) {
        otpMsgEl.innerHTML = `Mock OTP for testing: <strong style="color:var(--primary-color); font-size:1.2rem;">${mockOtp}</strong>`;
    }
}

// Mock Developer OTP
function requestDevOtp() {
    const mockDevOtp = Math.floor(100000 + Math.random() * 900000).toString();
    authState.signup.mockDevOtp = mockDevOtp;
    alert(`Developer Mock OTP: ${mockDevOtp}`);
}

// Verify Mock OTPs
function verifyOtps() {
    const userOtp = document.getElementById('otp-user').value.trim();
    const devOtp = document.getElementById('otp-dev').value.trim();

    if (!userOtp || !devOtp) {
        alert("Please enter both Email OTP and Developer OTP");
        return;
    }

    if (userOtp !== authState.signup.mockOtp) {
        alert("Invalid Email OTP");
        return;
    }

    if (devOtp !== authState.signup.mockDevOtp) {
        alert("Invalid Developer OTP");
        return;
    }

    // Success
    document.getElementById('signup-step-otp').classList.add('hidden');
    document.getElementById('signup-step-details').classList.remove('hidden');
}

// Finalize
async function finalizeSignup() {
    const fullName = document.getElementById('reg-fullname').value;
    const phone = document.getElementById('reg-phone').value;
    const businessName = document.getElementById('reg-business').value;
    const address = document.getElementById('reg-address').value;
    const pincode = document.getElementById('reg-pincode').value;
    const plan = document.getElementById('reg-plan').value;

    if (!fullName || !phone || !businessName) {
        alert("Please fill in required details");
        return;
    }

    const email = authState.signup.email;
    const password = authState.signup.pass;

    if (!email || !password) {
        alert("Registration Session Expired. Please refresh the page and try again.");
        return;
    }

    // 1. Create Supabase User
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: fullName,
                business_name: businessName
            }
        }
    });

    if (authError) {
        alert("Registration Failed: " + authError.message + "\n\nTip: Go to Supabase -> Auth -> Providers -> Email and disable 'Confirm Email' if enabled.");
        return;
    }

    if (!authData.user) {
        alert("Registration failed. Please try again.");
        return;
    }

    // 2. Generate Tenant ID
    const tenantId = generateTenantId();

    // 3. Insert into Owners table
    const { error: dbError } = await supabase
        .from('owners')
        .insert([{
            id: authData.user.id,
            tenant_id: tenantId,
            email: email,
            full_name: fullName,
            phone: phone,
            business_name: businessName,
            address: address,
            pincode: pincode,
            plan: plan
        }]);

    if (dbError) {
        alert("Account Created but Profile Save Failed!\nError: " + dbError.message + "\n\nCheck 'owners' table permissions/RLS or Supabase Logs.");
        return;
    }

    alert(`Account Created Successfully!\nYour Tenant ID is: ${tenantId}\n\nPlease keep this safe for login.`);

    // Switch to Login
    showLogin();
    // Pre-fill tenant id

}

function generateTenantId() {
    // 8 digit alphanumeric
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude I, O, 1, 0 for clarity
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Logout Helper
async function logout() {
    const session = localStorage.getItem('tenant_session');
    if (session) {
        try {
            const user = JSON.parse(session);
            const logId = localStorage.getItem('employee_log_id');
            if (user.role === 'employee' && logId) {
                await supabase
                    .from('employee_logs')
                    .update({ logout_time: new Date().toISOString() })
                    .eq('id', logId);
                localStorage.removeItem('employee_log_id');
            }
        } catch (e) {
            console.error("Logout log error:", e);
        }
    }

    localStorage.removeItem('tenant_session');
    supabase.auth.signOut();
    location.reload();
}

// ==========================================
// GLOBAL SALES REALTIME
// ==========================================
let _salesChannel = null;

function startSalesRealtime() {
    if (_salesChannel) return; // already subscribed
    if (!authState.owner || !authState.owner.tenant_id) return;

    _salesChannel = supabase
        .channel('sales-live-' + authState.owner.tenant_id)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'bills',
            filter: `tenant_id=eq.${authState.owner.tenant_id}`
        }, () => {
            // Refresh dashboard in background (silent)
            if (typeof loadDashboard === 'function') {
                loadDashboard(window.appState ? window.appState.dashboardFilter || 'today' : 'today');
            }
            // If Sales History view is currently open, refresh it
            const salesView = document.getElementById('sales');
            if (salesView && !salesView.classList.contains('hidden')) {
                if (typeof loadSales === 'function') loadSales();
            }
        })
        .subscribe((status) => {
            console.log('[Sales Realtime] Status:', status);
        });
}

function stopSalesRealtime() {
    if (_salesChannel) {
        supabase.removeChannel(_salesChannel);
        _salesChannel = null;
    }
}

// Add Enter key support for login
document.addEventListener('DOMContentLoaded', () => {
    const inputs = ['login-identifier', 'login-password'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') handleLogin();
            });
        }
    });
});
