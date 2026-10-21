const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const COOKIE_SECURE = process.env.NODE_ENV === 'production';
const ACCESS_COOKIE = 'compliq_access';
const REFRESH_COOKIE = 'compliq_refresh';
const AVATAR_BUCKET = 'profile-avatars';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseReady = Boolean(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey);
const adminClient = supabaseReady
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    })
    : null;

function createAuthClient() {
    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY before using authentication.');
    }
    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
}

function sendError(res, error, status = 500) {
    console.error(error);
    res.status(status).json({ error: error.message || 'Supabase request failed.' });
}

function requireSupabase(req, res, next) {
    if (!supabaseReady) {
        return res.status(503).json({
            error: 'Supabase is not configured. Set SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.'
        });
    }
    next();
}

function readCookie(req, name) {
    const cookieHeader = req.headers.cookie || '';
    const item = cookieHeader.split(';').map(part => part.trim())
        .find(part => part.startsWith(`${name}=`));
    return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function writeAuthCookies(res, session) {
    const secure = COOKIE_SECURE ? '; Secure' : '';
    const accessMaxAge = Math.max(0, session.expires_in || 3600);
    res.setHeader('Set-Cookie', [
        `${ACCESS_COOKIE}=${encodeURIComponent(session.access_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${accessMaxAge}${secure}`,
        `${REFRESH_COOKIE}=${encodeURIComponent(session.refresh_token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
    ]);
}

function clearAuthCookies(res) {
    const secure = COOKIE_SECURE ? '; Secure' : '';
    res.setHeader('Set-Cookie', [
        `${ACCESS_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
        `${REFRESH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    ]);
}

function profileToUser(profile) {
    return {
        id: profile.id,
        firstName: profile.first_name,
        lastName: profile.last_name,
        org: profile.org,
        email: profile.email,
        role: profile.role,
        sector: profile.sector,
        status: profile.status,
        avatarUrl: profile.avatar_url,
        phone: profile.phone,
        bio: profile.bio,
        createdAt: profile.created_at
    };
}

async function getProfile(userId) {
    const { data, error } = await adminClient
        .from('profiles')
        .select('id, first_name, last_name, org, email, role, sector, status, avatar_url, phone, bio, created_at')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    return data;
}

async function authenticate(req, res, next) {
    try {
        const accessToken = readCookie(req, ACCESS_COOKIE);
        const refreshToken = readCookie(req, REFRESH_COOKIE);
        const auth = createAuthClient();
        let { data: authData, error } = accessToken
            ? await auth.auth.getUser(accessToken)
            : { data: { user: null }, error: new Error('Sign in is required.') };

        if (error && refreshToken) {
            const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken });
            if (refreshed.error) {
                clearAuthCookies(res);
                return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
            }
            writeAuthCookies(res, refreshed.data.session);
            authData = { user: refreshed.data.user };
            error = null;
        }

        if (error || !authData.user) {
            return res.status(401).json({ error: 'Sign in is required.' });
        }
        const profile = await getProfile(authData.user.id);
        if (!profile) return res.status(403).json({ error: 'Your account profile is not configured.' });
        if (profile.status !== 'active') {
            return res.status(403).json({
                error: profile.status === 'rejected'
                    ? 'Account has been rejected'
                    : 'Account is pending admin approval'
            });
        }
        req.authUser = authData.user;
        req.profile = profile;
        next();
    } catch (error) {
        sendError(res, error);
    }
}

function requireAdmin(req, res, next) {
    if (req.profile.role !== 'Administrator') {
        return res.status(403).json({ error: 'Administrator access is required.' });
    }
    next();
}

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (req, res) => {
    res.status(supabaseReady ? 200 : 503).json({
        status: supabaseReady ? 'ok' : 'not_configured',
        provider: 'supabase'
    });
});

app.post('/api/auth/register', requireSupabase, async (req, res) => {
    const { firstName, lastName, org, email, password, role, sector } = req.body;
    const allowedRoles = ['Fleet Operator', 'Maintenance Engineer', 'Data Analyst', 'Site Manager'];
    if (!email || !password || !firstName || !lastName || !org) {
        return res.status(400).json({ error: 'Name, organization, email, and password are required.' });
    }
    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (!allowedRoles.includes(role) || !['wind', 'solar'].includes(sector)) {
        return res.status(400).json({ error: 'Choose a valid role and dashboard type.' });
    }

    try {
        const appUrl = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
        const { data, error } = await createAuthClient().auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
                emailRedirectTo: `${appUrl}/auth.html?mode=verify`,
                data: {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    org: org.trim(),
                    role,
                    sector
                }
            }
        });
        if (error) {
            const duplicate = /already registered|already exists/i.test(error.message);
            return res.status(duplicate ? 409 : 400).json({ error: duplicate ? 'Email already exists.' : error.message });
        }
        if (!data.user) return res.status(400).json({ error: 'Supabase did not create an account.' });
        if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            return res.status(409).json({ error: 'Email already exists.' });
        }
        if (data.session || data.user.email_confirmed_at) {
            await adminClient.auth.admin.deleteUser(data.user.id);
            return res.status(503).json({
                error: 'Email verification is not enabled in Supabase. Enable Confirm Email in the Email provider settings, then try again.'
            });
        }

        const { error: profileError } = await adminClient.from('profiles').upsert({
            id: data.user.id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            org: org.trim(),
            email: email.trim().toLowerCase(),
            role,
            sector,
            status: 'pending'
        });
        if (profileError) {
            await adminClient.auth.admin.deleteUser(data.user.id);
            throw profileError;
        }
        res.status(201).json({
            user: {
                id: data.user.id,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                org: org.trim(),
                email: email.trim().toLowerCase(),
                role,
                sector,
                status: 'pending'
            }
        });
    } catch (error) {
        sendError(res, error);
    }
});

app.post('/api/auth/login', requireSupabase, async (req, res) => {
    const { email, password, sector } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    try {
        const { data, error } = await createAuthClient().auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });
        if (error) {
            const unverified = error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message || '');
            return res.status(unverified ? 403 : 401).json({
                error: unverified
                    ? 'Please verify your email using the confirmation link we sent before signing in.'
                    : 'Invalid email or password.'
            });
        }
        if (!data.session) return res.status(401).json({ error: 'Invalid email or password.' });
        const profile = await getProfile(data.user.id);
        if (!profile) return res.status(403).json({ error: 'Account profile is not configured. Contact an administrator.' });
        if (profile.status !== 'active') {
            return res.status(403).json({
                error: profile.status === 'rejected'
                    ? 'Account has been rejected'
                    : 'Account is pending admin approval'
            });
        }

        writeAuthCookies(res, data.session);
        const user = profileToUser(profile);
        if (['wind', 'solar'].includes(sector)) user.sector = sector;
        res.json({ user });
    } catch (error) {
        sendError(res, error);
    }
});

app.get('/api/auth/session', requireSupabase, authenticate, (req, res) => {
    res.json({ user: profileToUser(req.profile) });
});

app.post('/api/auth/logout', requireSupabase, async (req, res) => {
    const accessToken = readCookie(req, ACCESS_COOKIE);
    const refreshToken = readCookie(req, REFRESH_COOKIE);
    if (accessToken) {
        try {
            const auth = createAuthClient();
            await auth.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
            await auth.auth.signOut({ scope: 'local' });
        } catch (error) {
            console.error('Could not revoke the Supabase session during logout.', error);
        }
    }
    clearAuthCookies(res);
    res.json({ success: true });
});

app.post('/api/auth/recovery', requireSupabase, async (req, res) => {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const redirectTo = `${process.env.APP_URL || `http://localhost:${PORT}`}/auth.html?mode=recovery`;
    try {
        const { error } = await createAuthClient().auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        sendError(res, error, 400);
    }
});

app.put('/api/auth/password/recovery', requireSupabase, async (req, res) => {
    const { accessToken, newPassword } = req.body;
    if (typeof accessToken !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'A valid recovery link and a password of at least 8 characters are required.' });
    }
    try {
        const { data, error } = await createAuthClient().auth.getUser(accessToken);
        if (error || !data.user) return res.status(401).json({ error: 'The password recovery link is invalid or expired.' });
        const { error: updateError } = await adminClient.auth.admin.updateUserById(data.user.id, { password: newPassword });
        if (updateError) throw updateError;
        clearAuthCookies(res);
        res.json({ success: true });
    } catch (error) {
        sendError(res, error);
    }
});

app.delete('/api/auth/account', requireSupabase, authenticate, async (req, res) => {
    try {
        const { error } = await adminClient.auth.admin.deleteUser(req.authUser.id);
        if (error) throw error;
        clearAuthCookies(res);
        res.json({ success: true });
    } catch (error) {
        sendError(res, error);
    }
});

app.put('/api/auth/profile', requireSupabase, authenticate, async (req, res) => {
    const { firstName, lastName, org, phone, bio } = req.body;
    const updates = {
        first_name: typeof firstName === 'string' ? firstName.trim() : req.profile.first_name,
        last_name: typeof lastName === 'string' ? lastName.trim() : req.profile.last_name,
        org: typeof org === 'string' ? org.trim() : req.profile.org,
        phone: typeof phone === 'string' ? phone.trim() : req.profile.phone,
        bio: typeof bio === 'string' ? bio.trim() : req.profile.bio
    };
    try {
        const { error } = await adminClient.from('profiles').update(updates).eq('id', req.authUser.id);
        if (error) throw error;
        res.json({ success: true, user: profileToUser({ ...req.profile, ...updates }) });
    } catch (error) {
        sendError(res, error);
    }
});

app.put('/api/auth/avatar', requireSupabase, authenticate, async (req, res) => {
    const { avatarUrl } = req.body;
    const match = typeof avatarUrl === 'string'
        ? avatarUrl.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+=*)$/)
        : null;
    if (!match) return res.status(400).json({ error: 'Avatar must be a PNG, JPEG, WebP, or GIF image.' });

    try {
        const image = Buffer.from(match[2], 'base64');
        if (!image.length || image.length > MAX_AVATAR_BYTES) {
            return res.status(400).json({ error: 'Avatar must be under 2MB.' });
        }
        const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
        const contentType = `image/${match[1]}`;
        const objectPath = `${req.authUser.id}/avatar.${extension}`;
        const { error: uploadError } = await adminClient.storage
            .from(AVATAR_BUCKET)
            .upload(objectPath, image, { contentType, upsert: true, cacheControl: '3600' });
        if (uploadError) throw uploadError;
        const { data } = adminClient.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
        const { error: profileError } = await adminClient.from('profiles')
            .update({ avatar_url: data.publicUrl }).eq('id', req.authUser.id);
        if (profileError) throw profileError;
        res.json({ success: true, avatarUrl: data.publicUrl });
    } catch (error) {
        sendError(res, error);
    }
});

app.put('/api/auth/password', requireSupabase, authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
        return res.status(400).json({ error: 'Enter your current password and a new password of at least 8 characters.' });
    }
    try {
        const auth = createAuthClient();
        const { data, error } = await auth.auth.signInWithPassword({
            email: req.authUser.email,
            password: currentPassword
        });
        if (error || !data.session) return res.status(401).json({ error: 'Current password is incorrect.' });

        const { data: updated, error: updateError } = await auth.auth.updateUser({ password: newPassword });
        if (updateError) throw updateError;
        if (updated.user) writeAuthCookies(res, updated.session || data.session);
        res.json({ success: true });
    } catch (error) {
        sendError(res, error);
    }
});

app.get('/api/data/:key', requireSupabase, authenticate, async (req, res) => {
    try {
        const { data, error } = await adminClient.from('app_data')
            .select('value')
            .eq('key', req.params.key)
            .maybeSingle();
        if (error) throw error;
        res.json(data ? data.value : null);
    } catch (error) {
        sendError(res, error);
    }
});

app.post('/api/data/:key', requireSupabase, authenticate, async (req, res) => {
    if (req.params.key.length > 100) return res.status(400).json({ error: 'Data key is too long.' });
    try {
        const { error } = await adminClient.from('app_data').upsert({
            key: req.params.key,
            value: req.body,
            updated_by: req.authUser.id,
            updated_at: new Date().toISOString()
        }, { onConflict: 'key' });
        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        sendError(res, error);
    }
});

app.get('/api/admin/users', requireSupabase, authenticate, requireAdmin, async (req, res) => {
    try {
        const authUsers = [];
        const perPage = 1000;
        for (let page = 1; ; page += 1) {
            const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
            if (error) throw error;
            authUsers.push(...data.users);
            if (data.users.length < perPage) break;
        }

        const { data, error } = await adminClient.from('profiles')
            .select('id, first_name, last_name, org, email, role, sector, status, avatar_url, phone, bio, created_at')
            .order('created_at', { ascending: false });
        if (error) throw error;

        // Auth is the source of truth. Ignore orphaned profile rows left behind
        // by manual Auth deletions and prefer the current Auth email address.
        const authById = new Map(authUsers.map(user => [user.id, user]));
        res.json(data
            .filter(profile => authById.has(profile.id))
            .map(profile => {
                const authUser = authById.get(profile.id);
                return {
                    ...profileToUser(profile),
                    email: authUser.email || profile.email,
                    createdAt: authUser.created_at || profile.created_at
                };
            }));
    } catch (error) {
        sendError(res, error);
    }
});

app.put('/api/admin/users/:email/status', requireSupabase, authenticate, requireAdmin, async (req, res) => {
    const { status } = req.body;
    if (!['active', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: 'Valid account status is required.' });
    }
    try {
        const { data, error } = await adminClient.from('profiles')
            .update({ status })
            .eq('email', req.params.email)
            .select('id');
        if (error) throw error;
        if (!data.length) return res.status(404).json({ error: 'Account not found.' });
        res.json({ success: true, updated: data.length });
    } catch (error) {
        sendError(res, error);
    }
});

app.put('/api/admin/users/:id/role', requireSupabase, authenticate, requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!['Administrator', 'Fleet Operator', 'Maintenance Engineer', 'Data Analyst', 'Site Manager'].includes(role)) {
        return res.status(400).json({ error: 'Valid role is required.' });
    }
    try {
        const { data, error } = await adminClient.from('profiles')
            .update({ role }).eq('id', req.params.id).select('id');
        if (error) throw error;
        if (!data.length) return res.status(404).json({ error: 'Account not found.' });
        res.json({ success: true, updated: data.length });
    } catch (error) {
        sendError(res, error);
    }
});

app.delete('/api/admin/users/:id', requireSupabase, authenticate, requireAdmin, async (req, res) => {
    try {
        const { error } = await adminClient.auth.admin.deleteUser(req.params.id);
        if (error) throw error;
        res.json({ success: true, deleted: 1 });
    } catch (error) {
        sendError(res, error);
    }
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API route not found.' });
});

app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    if (!supabaseReady) {
        console.warn('Supabase is not configured. Copy .env.example to .env and add project credentials.');
    }
});
