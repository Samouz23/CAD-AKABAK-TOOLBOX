// =======================================================
// FICHIER :  src/js/panels/notes.js (VERSION INTÉGRALE FINALE)
// =======================================================
import { getSettings } from './mainsettings/mainsettings.js';

// --- FONCTION HTML ---
function renderFileTree(tree, level = 0) {
  return tree.map(item => {
    const isFolder = item.type === 'folder';
    const padding = `style="padding-left: ${level * 20}px;"`;
    const icon = isFolder ? '📁' : '📄';
    const dataAttributes = `data-path="${item.path || item.fullPath}" data-type="${item.type}"`;
    const childrenHtml = isFolder ? `<div class="folder-content" style="display: none;">${renderFileTree(item.children, level + 1)}</div>` : '';
    return `<div class="tree-item ${isFolder ? 'tree-folder' : 'tree-file'}" ${dataAttributes} ${padding}>${icon} ${item.name}</div>${childrenHtml}`;
  }).join('');
}

export function getNotesPanelHtml() {
  return `
    <div class="p-6 text-green-400 h-full flex flex-col">
      <div class="flex justify-between items-center mb-6 flex-shrink-0">
        <h1 class="text-4xl font-bold text-white">Notebook</h1>
        <div>
          <button id="new-note-btn" class="action-btn">New Note</button>
          <button id="pop-out-btn" data-tool="notes" title="Open in a new window" class="btn btn--ghost p-2 ml-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 flex-grow overflow-hidden">
        <div class="md:col-span-1 flex flex-col h-[80vh] bg-gray-900/50 p-4 rounded-md border border-green-800">
          <input type="search" id="note-search" placeholder="Search..." class="form-input mb-4 flex-shrink-0">
          <div id="note-tree-container" class="overflow-y-auto flex-grow"></div>
        </div>
        <div class="md:col-span-2 flex flex-col h-full bg-gray-900/50 p-4 rounded-md border border-green-800">
          <div id="note-preview-header" class="flex justify-end items-center mb-2" style="display: none;">
            <div id="note-actions" class="space-x-4">
              <button id="edit-note-btn" class="action-btn" disabled>Edit</button>
              <button id="save-note-btn-edit" class="action-btn" style="display: none;">Save</button>
            </div>
          </div>
          <div id="note-preview-container" class="w-full h-full flex-grow overflow-hidden">
            <p class="p-4 text-gray-500 text-center">Select a file or create a new note.</p>
          </div>
          <div id="new-note-form" class="w-full h-full hidden flex-col">
            <h2 class="calc-title">Create a new note</h2>
            <div class="mb-2"><label>Destination</label><select id="new-note-destination" class="form-input"></select></div>
            <div class="mb-2"><input type="text" id="new-note-folder-name" class="form-input" placeholder="Or new folder name..." style="display:none;"></div>
            <input type="text" id="new-note-name" placeholder="File name (without .txt)" class="form-input mb-2">
            <textarea id="new-note-content" class="form-input flex-grow mb-2"></textarea>
            <div class="flex justify-end space-x-2"><button id="cancel-note-btn" class="action-btn">Cancel</button><button id="save-note-btn" class="action-btn">Save</button></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// --- LOGIQUE D'INITIALISATION ---
export function initializeNotesPanel() {
  const treeContainer = document.getElementById('note-tree-container');
  const previewContainer = document.getElementById('note-preview-container');
  const previewHeader = document.getElementById('note-preview-header');
  const newNoteForm = document.getElementById('new-note-form');
  const newNoteBtn = document.getElementById('new-note-btn');
  const editBtn = document.getElementById('edit-note-btn');
  const saveEditBtn = document.getElementById('save-note-btn-edit');

  let notesRootPath = '';
  let currentFileTree = [];
  let currentFilePath = null;

  function getFoldersFromTree(tree, parentPath, level = 0) {
    if (!tree) return [];
    let folders = [{ path: parentPath, name: `${'· '.repeat(level)} (Root)` }];
    tree.forEach(item => {
      if (item.type === 'folder') {
        folders.push({ path: item.fullPath, name: `${'· '.repeat(level + 1)} ${item.name}` });
        folders = folders.concat(getFoldersFromTree(item.children, item.fullPath, level + 1));
      }
    });
    return folders;
  }
  
  async function loadTree() {
    const settings = await getSettings();
    if (settings && settings.paths && settings.paths.dataRoot) {
      notesRootPath = `${settings.paths.dataRoot}\\notes`;
      currentFileTree = await window.electronAPI.getNotesTree(notesRootPath);
      treeContainer.innerHTML = renderFileTree(currentFileTree);
    } else {
      treeContainer.innerHTML = '<p class="text-red-500">Paths not configured in Settings.</p>';
    }
  }

  treeContainer.addEventListener('click', async (e) => {
    const item = e.target.closest('.tree-item');
    if (!item) return;
    
    if (item.classList.contains('tree-folder')) {
      const content = item.nextElementSibling;
      if (content && content.classList.contains('folder-content')) {
        content.style.display = content.style.display === 'none' ? 'block' : 'none';
      }
      return;
    }

    if (item.classList.contains('tree-file')) {
      currentFilePath = item.dataset.path;
      const fileExt = currentFilePath.split('.').pop().toLowerCase();
      
      previewContainer.style.display = 'block';
      newNoteForm.style.display = 'none';
      previewHeader.style.display = 'flex';
      editBtn.style.display = 'inline-block';
      saveEditBtn.style.display = 'none';

      try {
        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(fileExt)) {
          previewContainer.innerHTML = `<img src="file://${currentFilePath.replace(/\\/g, '/')}" class="max-w-full max-h-full object-contain mx-auto">`;
          editBtn.disabled = true;
        } else if (fileExt === 'pdf') {
          previewContainer.innerHTML = `<iframe src="file://${currentFilePath}" class="w-full h-full border-0"></iframe>`;
          editBtn.disabled = true;
        } else if (fileExt === 'txt') {
          const content = await window.electronAPI.readFile(currentFilePath);
          previewContainer.innerHTML = `<textarea class="preview-textarea" readonly>${content || ''}</textarea>`;
          editBtn.disabled = false;
        } else {
          previewContainer.innerHTML = `<p class="p-4 text-gray-500">Preview not supported.</p>`;
          editBtn.disabled = true;
        }
      } catch (error) { console.error(error); }
    }
  });

  editBtn.addEventListener('click', () => {
    const textarea = previewContainer.querySelector('.preview-textarea');
    if (textarea) {
      textarea.readOnly = false;
      textarea.classList.add('editing-active');
      textarea.focus();
      editBtn.style.display = 'none';
      saveEditBtn.style.display = 'inline-block';
    }
  });

  saveEditBtn.addEventListener('click', async () => {
    const textarea = previewContainer.querySelector('.preview-textarea');
    if (textarea && currentFilePath) {
      const newContent = textarea.value;
      const result = await window.electronAPI.saveFile({ filePath: currentFilePath, content: newContent });
      if (result.success) {
        textarea.readOnly = true;
        textarea.classList.remove('editing-active');
        saveEditBtn.style.display = 'none';
        editBtn.style.display = 'inline-block';
      } else { alert(`Error: ${result.error}`); }
    }
  });

  newNoteBtn.addEventListener('click', () => {
    previewContainer.style.display = 'none';
    previewHeader.style.display = 'none';
    newNoteForm.style.display = 'flex';
    
    const destinationSelect = document.getElementById('new-note-destination');
    const newFolderInput = document.getElementById('new-note-folder-name');
    const noteNameInput = document.getElementById('new-note-name');
    const noteContentInput = document.getElementById('new-note-content');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');
    const saveNoteBtn = document.getElementById('save-note-btn');

    const folders = getFoldersFromTree(currentFileTree, notesRootPath);
    destinationSelect.innerHTML = folders.map(f => `<option value="${f.path}">${f.name}</option>`).join('') + '<option value="--new-folder--">== New Folder ==</option>';
    newFolderInput.style.display = 'none';

    destinationSelect.onchange = () => {
      newFolderInput.style.display = destinationSelect.value === '--new-folder--' ? 'block' : 'none';
    };
    
    cancelNoteBtn.onclick = () => {
      previewContainer.style.display = 'block';
      previewHeader.style.display = 'flex';
      newNoteForm.style.display = 'none';
    };
    
    saveNoteBtn.onclick = async () => {
      const noteName = noteNameInput.value;
      const noteContent = noteContentInput.value;
      if (!noteName) return;

      let destinationPath = destinationSelect.value;
      if (destinationPath === '--new-folder--') {
        const newFolderName = newFolderInput.value;
        if (!newFolderName) return;
        destinationPath = `${notesRootPath}\\${newFolderName}`;
      }
      
      const filePath = `${destinationPath}\\${noteName}.txt`;
      const result = await window.electronAPI.saveFile({ filePath, content: noteContent });
      
      if (result.success) {
        noteNameInput.value = '';
        noteContentInput.value = '';
        newFolderInput.value = '';
        await loadTree();
        cancelNoteBtn.click();
      } else { alert(`Error: ${result.error}`); }
    };
  });

  loadTree();
}