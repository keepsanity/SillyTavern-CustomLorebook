import {
    world_names,
    loadWorldInfo,
    moveWorldInfoEntry,
} from '../../../world-info.js';

const EXTENSION_NAME = 'SillyTavern-CustomLorebook';

let isPanelOpen = false;
let currentSourceData = null;
let currentSourceName = '';

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
            () => toastr.success('클립보드에 복사되었습니다.'),
            () => fallbackCopy(text),
        );
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        toastr.success('클립보드에 복사되었습니다.');
    } catch {
        toastr.error('복사에 실패했습니다.');
    }
    document.body.removeChild(ta);
}

function getStatus(entry) {
    if (entry.disable) return 'disabled';
    if (entry.constant) return 'constant';
    if (entry.vectorized) return 'vectorized';
    return 'selective';
}

function statusBadge(status) {
    const map = {
        constant: { cls: 'clm-badge-blue', text: '🔵 상시' },
        selective: { cls: 'clm-badge-green', text: '🟢 선택' },
        vectorized: { cls: 'clm-badge-purple', text: '🔗 벡터' },
        disabled: { cls: 'clm-badge-off', text: '비활성' },
    };
    const m = map[status];
    return `<span class="clm-badge ${m.cls}">${m.text}</span>`;
}

function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCurrentEditorBookName() {
    const idx = $('#world_editor_select').val();
    if (idx === undefined || idx === '') return '';
    const i = Number(idx);
    if (Number.isNaN(i)) return '';
    return world_names[i] || '';
}

function populateSourceSelect() {
    const select = document.getElementById('clm_source_select');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = '<option value="">--- 출처 로어북 선택 ---</option>';
    (world_names || []).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (prev && world_names.includes(prev)) {
        select.value = prev;
    }
}

function populateTargetSelect() {
    const select = document.getElementById('clm_target_select');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = '<option value="__current__">⚙️ 현재 편집 중인 로어북</option>';
    (world_names || []).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    if (prev && (prev === '__current__' || world_names.includes(prev))) {
        select.value = prev;
    }
}

function resolveTargetName() {
    const v = document.getElementById('clm_target_select')?.value;
    if (!v) return '';
    if (v === '__current__') return getCurrentEditorBookName();
    return v;
}

async function onSourceChange() {
    const select = document.getElementById('clm_source_select');
    const name = select?.value || '';
    currentSourceName = name;
    currentSourceData = null;
    if (!name) {
        renderEntryList(null);
        return;
    }
    try {
        const data = await loadWorldInfo(name);
        currentSourceData = data;
        renderEntryList(data);
    } catch (err) {
        console.error(`[${EXTENSION_NAME}] Failed to load world info:`, err);
        toastr.error('로어북 로드 실패');
    }
}

function getFilteredEntries(data) {
    const search = (document.getElementById('clm_search')?.value || '').toLowerCase().trim();
    const filter = document.querySelector('.clm-filter-chip.active')?.dataset.filter || 'all';
    const entries = Object.entries(data.entries || {}).map(([k, v]) => ({ key: k, entry: v }));

    entries.sort((a, b) => {
        const ai = a.entry.displayIndex;
        const bi = b.entry.displayIndex;
        if (ai !== undefined && bi !== undefined && ai !== bi) return ai - bi;
        return (a.entry.uid || 0) - (b.entry.uid || 0);
    });

    return entries.filter(({ entry }) => {
        if (filter !== 'all' && getStatus(entry) !== filter) return false;
        if (search) {
            const inTitle = (entry.comment || '').toLowerCase().includes(search);
            const inKeys = (entry.key || []).join(' ').toLowerCase().includes(search);
            const inSec = (entry.keysecondary || []).join(' ').toLowerCase().includes(search);
            const inContent = (entry.content || '').toLowerCase().includes(search);
            if (!(inTitle || inKeys || inSec || inContent)) return false;
        }
        return true;
    });
}

function renderEntryList(data) {
    const list = document.getElementById('clm_entry_list');
    if (!list) return;

    if (!data || !data.entries || Object.keys(data.entries).length === 0) {
        list.innerHTML = '<div class="clm-empty">출처 로어북에 항목이 없습니다.</div>';
        return;
    }

    const filtered = getFilteredEntries(data);
    if (filtered.length === 0) {
        list.innerHTML = '<div class="clm-empty">조건에 맞는 항목이 없습니다.</div>';
        return;
    }

    list.innerHTML = filtered.map(({ key, entry }) => entryHtml(key, entry)).join('');
    attachEntryListeners();
}

function entryHtml(mapKey, entry) {
    const title = entry.comment || '(제목 없음)';
    const keys = entry.key || [];
    const sec = entry.keysecondary || [];
    const status = getStatus(entry);

    const badges = [statusBadge(status)];
    if (entry.excludeRecursion) badges.push('<span class="clm-badge clm-badge-warn">excludeRec</span>');
    if (entry.preventRecursion) badges.push('<span class="clm-badge clm-badge-warn">preventRec</span>');
    if (entry.delayUntilRecursion) badges.push('<span class="clm-badge clm-badge-warn">delayRec</span>');

    const keyList = keys.length
        ? keys.map((k) => `<code>${escapeHtml(k)}</code>`).join(' ')
        : '<span class="clm-empty-inline">키워드 없음</span>';
    const secList = sec.length
        ? `<div class="clm-keys-row"><span class="clm-keys-label">보조:</span>${sec.map((k) => `<code>${escapeHtml(k)}</code>`).join(' ')}</div>`
        : '';

    return `
    <div class="clm-entry" data-uid="${escapeHtml(mapKey)}">
        <div class="clm-entry-head">
            <span class="clm-entry-title" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
            <div class="clm-entry-badges">${badges.join('')}</div>
        </div>
        <div class="clm-entry-keys">
            <div class="clm-keys-row"><span class="clm-keys-label">주:</span>${keyList}</div>
            ${secList}
        </div>
        <div class="clm-entry-content">${escapeHtml(entry.content || '(내용 없음)')}</div>
        <div class="clm-entry-actions">
            <button class="menu_button clm-action" data-action="copy-title" title="제목 복사"><i class="fa-solid fa-heading"></i></button>
            <button class="menu_button clm-action" data-action="copy-keys" title="키워드 복사"><i class="fa-solid fa-key"></i></button>
            <button class="menu_button clm-action" data-action="copy-content" title="내용 복사"><i class="fa-solid fa-copy"></i></button>
            <button class="menu_button clm-action clm-add-btn" data-action="copy-to" title="대상 로어북에 복사"><i class="fa-solid fa-plus"></i></button>
            <button class="menu_button clm-action clm-move-btn" data-action="move-to" title="대상 로어북으로 이동 (출처에서 삭제)"><i class="fa-solid fa-right-long"></i></button>
        </div>
    </div>`;
}

function attachEntryListeners() {
    document.querySelectorAll('.clm-entry').forEach((el) => {
        const uid = el.dataset.uid;
        const entry = currentSourceData?.entries?.[uid];
        if (!entry) return;

        el.querySelector('.clm-entry-content')?.addEventListener('click', (e) => {
            e.currentTarget.classList.toggle('expanded');
        });

        el.querySelectorAll('.clm-action').forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                if (action === 'copy-title') {
                    copyToClipboard(entry.comment || '');
                } else if (action === 'copy-keys') {
                    const all = [...(entry.key || []), ...(entry.keysecondary || [])];
                    copyToClipboard(all.join(', '));
                } else if (action === 'copy-content') {
                    copyToClipboard(entry.content || '');
                } else if (action === 'copy-to') {
                    await transferEntry(uid, false);
                } else if (action === 'move-to') {
                    await transferEntry(uid, true);
                }
            });
        });
    });
}

async function transferEntry(uid, deleteOriginal) {
    if (!currentSourceName) {
        toastr.warning('출처 로어북을 먼저 선택하세요.');
        return;
    }
    const targetName = resolveTargetName();
    if (!targetName) {
        toastr.warning('대상 로어북이 지정되지 않았습니다. (편집 중인 로어북이 없거나 대상이 비어있음)');
        return;
    }
    if (targetName === currentSourceName) {
        toastr.warning('출처와 대상이 같은 로어북입니다.');
        return;
    }

    const ok = await moveWorldInfoEntry(currentSourceName, targetName, uid, { deleteOriginal });
    if (ok && deleteOriginal) {
        // refresh source list since the entry was removed
        try {
            currentSourceData = await loadWorldInfo(currentSourceName);
            renderEntryList(currentSourceData);
        } catch (err) {
            console.error(`[${EXTENSION_NAME}] Refresh after move failed:`, err);
        }
    }
}

function togglePanel() {
    isPanelOpen = !isPanelOpen;
    const panel = document.getElementById('clm_panel');
    const btn = document.getElementById('clm_toggle_btn');
    panel?.classList.toggle('open', isPanelOpen);
    if (btn) btn.textContent = isPanelOpen ? '로어북 커스텀 닫기' : '로어북 커스텀하기';

    if (isPanelOpen) {
        populateSourceSelect();
        populateTargetSelect();
        if (currentSourceName) {
            onSourceChange();
        }
    }
}

function createUI() {
    const worldPopup = document.getElementById('world_popup');
    if (!worldPopup) {
        console.warn(`[${EXTENSION_NAME}] #world_popup not found`);
        return;
    }
    if (document.getElementById('clm_container')) return;

    const container = document.createElement('div');
    container.id = 'clm_container';

    container.innerHTML = `
        <button id="clm_toggle_btn" class="menu_button">로어북 커스텀하기</button>
        <div id="clm_panel">
            <div class="clm-row">
                <label class="clm-label">출처 로어북:</label>
                <select id="clm_source_select" class="text_pole"></select>
            </div>
            <div class="clm-row">
                <label class="clm-label">대상 로어북:</label>
                <select id="clm_target_select" class="text_pole"></select>
            </div>
            <div class="clm-row clm-toolbar">
                <input type="search" id="clm_search" class="text_pole" placeholder="제목 / 키워드 / 내용 검색...">
                <button class="menu_button clm-refresh-btn" id="clm_refresh" title="새로고침"><i class="fa-solid fa-arrows-rotate"></i></button>
            </div>
            <div class="clm-filter-group">
                <button class="clm-filter-chip active" data-filter="all">전체</button>
                <button class="clm-filter-chip" data-filter="constant"><span class="clm-dot clm-dot-blue"></span>상시</button>
                <button class="clm-filter-chip" data-filter="selective"><span class="clm-dot clm-dot-green"></span>선택</button>
                <button class="clm-filter-chip" data-filter="vectorized"><span class="clm-dot clm-dot-purple"></span>벡터</button>
                <button class="clm-filter-chip" data-filter="disabled"><span class="clm-dot clm-dot-off"></span>비활성</button>
            </div>
            <div id="clm_entry_list" class="clm-entry-list">
                <div class="clm-empty">출처 로어북을 선택하세요.</div>
            </div>
        </div>
    `;

    // Insert at the top of #world_popup so it's clearly visible above the existing editor controls
    worldPopup.insertBefore(container, worldPopup.firstChild);

    document.getElementById('clm_toggle_btn').addEventListener('click', togglePanel);
    document.getElementById('clm_source_select').addEventListener('change', onSourceChange);
    document.getElementById('clm_search').addEventListener('input', () => {
        if (currentSourceData) renderEntryList(currentSourceData);
    });
    document.getElementById('clm_refresh').addEventListener('click', async () => {
        populateSourceSelect();
        populateTargetSelect();
        if (currentSourceName) await onSourceChange();
        toastr.info('새로고침되었습니다.');
    });

    document.querySelectorAll('.clm-filter-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.clm-filter-chip').forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            if (currentSourceData) renderEntryList(currentSourceData);
        });
    });
}

async function init() {
    console.log(`[${EXTENSION_NAME}] Initializing...`);

    if (typeof SillyTavern === 'undefined' || !SillyTavern.getContext) {
        console.warn(`[${EXTENSION_NAME}] SillyTavern not ready, retrying in 500ms...`);
        setTimeout(init, 500);
        return;
    }

    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
        if (document.getElementById('world_popup')) break;
        await new Promise((r) => setTimeout(r, 500));
        attempts++;
    }

    if (!document.getElementById('world_popup')) {
        console.warn(`[${EXTENSION_NAME}] #world_popup not found after waiting`);
        return;
    }

    createUI();
    console.log(`[${EXTENSION_NAME}] Initialized successfully`);
}

jQuery(async () => {
    await init();
});
