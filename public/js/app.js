/* ============================================================
   Ride Sharing Matching DBMS - Frontend Application
   ============================================================ */

const API_BASE = '';

// State
let selectedRequestId = null;
let selectedDriverId = null;

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initModal();
    initForms();
    initRefreshButtons();

    // Load initial data
    loadStats();
    loadRides();
    loadDrivers();

    // Auto-refresh stats every 5 seconds (simulates peak-hour monitoring)
    setInterval(loadStats, 5000);
    setInterval(loadRides, 15000);
    setInterval(loadDrivers, 30000);
});

// ============================================================
// TABS
// ============================================================
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${tab}`).classList.add('active');

            if (tab === 'match') {
                loadPendingRequests();
                loadAvailableDrivers();
            }
        });
    });
}

// ============================================================
// MODAL
// ============================================================
function initModal() {
    const modal = document.getElementById('modal-request');
    const btn = document.getElementById('btn-request-ride');
    const close = modal.querySelector('.modal-close');

    btn.addEventListener('click', () => modal.classList.add('active'));
    close.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
}

// ============================================================
// FORMS
// ============================================================
function initForms() {
    // Request Ride
    document.getElementById('form-request').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        const res = await apiPost('/api/rides/request', {
            ...data,
            pickup_lat: parseFloat(data.pickup_lat),
            pickup_lng: parseFloat(data.pickup_lng),
            dropoff_lat: parseFloat(data.dropoff_lat),
            dropoff_lng: parseFloat(data.dropoff_lng),
            fare_estimate: parseFloat(data.fare_estimate) || null
        });
        if (res.success) {
            showToast('Ride requested successfully', 'success');
            document.getElementById('modal-request').classList.remove('active');
            e.target.reset();
            loadRides();
            loadStats();
        } else {
            showToast(res.error || 'Failed to request ride', 'error');
        }
    });

    // Register Driver
    document.getElementById('form-driver').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        const res = await apiPost('/api/drivers/register', data);
        if (res.success) {
            showToast('Driver registered', 'success');
            e.target.reset();
            loadDrivers();
        } else {
            showToast(res.error || 'Failed to register', 'error');
        }
    });

    // Update Location
    document.getElementById('form-location').addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target));
        const res = await apiPut(`/api/drivers/${data.driver_id}/location`, {
            latitude: parseFloat(data.latitude),
            longitude: parseFloat(data.longitude)
        });
        if (res.success) {
            showToast('Location updated', 'success');
            e.target.reset();
            loadDrivers();
        } else {
            showToast(res.error || 'Failed to update', 'error');
        }
    });

    // Match Button
    document.getElementById('btn-match').addEventListener('click', async () => {
        if (!selectedRequestId || !selectedDriverId) return;
        const res = await apiPost('/api/rides/match', {
            request_id: selectedRequestId,
            driver_id: selectedDriverId,
            fare_estimate: 20.00
        });
        if (res.success) {
            showToast('Ride matched!', 'success');
            selectedRequestId = null;
            selectedDriverId = null;
            updateSelectionUI();
            loadPendingRequests();
            loadAvailableDrivers();
            loadRides();
            loadStats();
        } else {
            showToast(res.error || 'Match failed', 'error');
        }
    });
}

function initRefreshButtons() {
    document.getElementById('btn-refresh-rides').addEventListener('click', loadRides);
    document.getElementById('btn-refresh-drivers').addEventListener('click', loadDrivers);
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadStats() {
    try {
        const data = await apiGet('/api/rides/stats');
        if (data.success) {
            document.getElementById('stat-pending').textContent = data.stats.pending_requests;
            document.getElementById('stat-matched').textContent = data.stats.matched_rides;
            document.getElementById('stat-active').textContent = data.stats.active_trips;
            document.getElementById('stat-drivers').textContent = data.stats.available_drivers;
            document.getElementById('stat-completed').textContent = data.stats.completed_today;
        }
    } catch (e) {
        document.getElementById('connection-status').textContent = 'Disconnected';
        document.getElementById('connection-status').style.color = '#ef4444';
    }
}

async function loadRides() {
    const tbody = document.getElementById('rides-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Loading...</td></tr>';
    const data = await apiGet('/api/rides/active');
    if (!data.success || data.rides.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No active rides</td></tr>';
        return;
    }
    tbody.innerHTML = data.rides.map(r => `
        <tr>
            <td>#${r.request_id}</td>
            <td>${escapeHtml(r.rider_name)}</td>
            <td>${escapeHtml(r.pickup_address || '—')}</td>
            <td>${escapeHtml(r.dropoff_address || '—')}</td>
            <td>$${r.fare_estimate || '—'}</td>
            <td><span class="status-badge status-${r.status}">${r.status}</span></td>
            <td>${escapeHtml(r.driver_name)}</td>
            <td>${formatTime(r.created_at)}</td>
            <td>
                ${renderRideActions(r)}
            </td>
        </tr>
    `).join('');

    // Attach action handlers
    tbody.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', () => handleRideAction(btn.dataset.id, btn.dataset.action));
    });
}

function renderRideActions(ride) {
    const actions = [];
    if (ride.status === 'matched') {
        actions.push(`<button class="btn btn-success btn-small btn-action" data-id="${ride.request_id}" data-action="picked_up">Pickup</button>`);
        actions.push(`<button class="btn btn-danger btn-small btn-action" data-id="${ride.request_id}" data-action="cancelled">Cancel</button>`);
    } else if (ride.status === 'picked_up') {
        actions.push(`<button class="btn btn-success btn-small btn-action" data-id="${ride.request_id}" data-action="completed">Complete</button>`);
    } else if (ride.status === 'pending') {
        actions.push(`<button class="btn btn-danger btn-small btn-action" data-id="${ride.request_id}" data-action="cancelled">Cancel</button>`);
    }
    return actions.join(' ');
}

async function handleRideAction(id, action) {
    const res = await apiPut(`/api/rides/${id}/status`, { status: action });
    if (res.success) {
        showToast(`Ride ${action}`, 'success');
        loadRides();
        loadStats();
    } else {
        showToast(res.error || 'Action failed', 'error');
    }
}

async function loadDrivers() {
    const tbody = document.getElementById('drivers-tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Loading...</td></tr>';
    const data = await apiGet('/api/drivers');
    if (!data.success || data.drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No drivers</td></tr>';
        return;
    }
    tbody.innerHTML = data.drivers.map(d => `
        <tr>
            <td>#${d.driver_id}</td>
            <td>${escapeHtml(d.name)}</td>
            <td>${escapeHtml(d.vehicle_model)}</td>
            <td>${escapeHtml(d.vehicle_plate)}</td>
            <td><span class="status-badge status-${d.status}">${d.status}</span></td>
            <td>${d.rating}</td>
            <td>${d.total_trips}</td>
            <td>${d.latitude ? `${d.latitude.toFixed(4)}, ${d.longitude.toFixed(4)}` : '—'}</td>
            <td>
                <button class="btn btn-secondary btn-small" onclick="toggleDriverStatus(${d.driver_id}, '${d.status}')">
                    ${d.status === 'available' ? 'Go Offline' : 'Go Online'}
                </button>
            </td>
        </tr>
    `).join('');
}

async function toggleDriverStatus(id, current) {
    const newStatus = current === 'available' ? 'offline' : 'available';
    const res = await apiPut(`/api/drivers/${id}/status`, { status: newStatus });
    if (res.success) {
        showToast(`Driver is now ${newStatus}`, 'success');
        loadDrivers();
        loadStats();
    }
}

async function loadPendingRequests() {
    const container = document.getElementById('pending-requests');
    container.innerHTML = '<p class="loading">Loading...</p>';
    const data = await apiGet('/api/rides/pending');
    if (!data.success || data.requests.length === 0) {
        container.innerHTML = '<p class="empty-state">No pending requests</p>';
        return;
    }
    container.innerHTML = data.requests.map(r => `
        <div class="match-card ${selectedRequestId === r.request_id ? 'selected' : ''}"
             data-id="${r.request_id}" data-type="request">
            <h4>Request #${r.request_id}</h4>
            <p>Rider: ${escapeHtml(r.rider_name)}</p>
            <p>From: ${escapeHtml(r.pickup_address || '—')}</p>
            <p>To: ${escapeHtml(r.dropoff_address || '—')}</p>
            <p>Fare: $${r.fare_estimate || '—'}</p>
        </div>
    `).join('');

    container.querySelectorAll('.match-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedRequestId = parseInt(card.dataset.id);
            updateSelectionUI();
            loadPendingRequests();
        });
    });
}

async function loadAvailableDrivers() {
    const container = document.getElementById('available-drivers');
    container.innerHTML = '<p class="loading">Loading...</p>';
    const data = await apiGet('/api/drivers/available');
    if (!data.success || data.drivers.length === 0) {
        container.innerHTML = '<p class="empty-state">No available drivers</p>';
        return;
    }
    container.innerHTML = data.drivers.map(d => `
        <div class="match-card ${selectedDriverId === d.driver_id ? 'selected' : ''}"
             data-id="${d.driver_id}" data-type="driver">
            <h4>${escapeHtml(d.name)}</h4>
            <p>${escapeHtml(d.vehicle_model)} (${escapeHtml(d.vehicle_plate)})</p>
            <p>Rating: ${d.rating}</p>
            <p>Loc: ${d.latitude?.toFixed(4)}, ${d.longitude?.toFixed(4)}</p>
        </div>
    `).join('');

    container.querySelectorAll('.match-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedDriverId = parseInt(card.dataset.id);
            updateSelectionUI();
            loadAvailableDrivers();
        });
    });
}

function updateSelectionUI() {
    document.getElementById('sel-request').textContent = selectedRequestId ? `#${selectedRequestId}` : 'None';
    document.getElementById('sel-driver').textContent = selectedDriverId ? `#${selectedDriverId}` : 'None';
    document.getElementById('btn-match').disabled = !(selectedRequestId && selectedDriverId);
}

// ============================================================
// API HELPERS
// ============================================================
async function apiGet(url) {
    const res = await fetch(`${API_BASE}${url}`);
    return res.json();
}

async function apiPost(url, body) {
    const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

async function apiPut(url, body) {
    const res = await fetch(`${API_BASE}${url}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    return res.json();
}

// ============================================================
// UTILITIES
// ============================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function escapeHtml(str) {
    if (!str) return '—';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
