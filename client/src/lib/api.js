export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

async function handle(res) {
  let body = {};
  try { body = await res.json(); } catch { /* not json */ }
  if (!res.ok) throw new ApiError(res.status, body.error || 'Something went wrong. Please try again.', body.fields);
  return body;
}

export const getApplication = (id) => fetch(`/api/applications/${encodeURIComponent(id)}`).then(handle);

/** Multipart upload with progress (fetch cannot report upload progress). */
function send(method, url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onerror = () => reject(new ApiError(0, 'Network error. Please check your connection and try again.'));
    x.onload = () => {
      let b = {};
      try { b = JSON.parse(x.responseText); } catch { /* ignore */ }
      if (x.status >= 200 && x.status < 300) resolve(b);
      else reject(new ApiError(x.status, b.error || 'Something went wrong. Please try again.', b.fields));
    };
    x.send(form);
  });
}

/** pending: [{ category, file }]; removeIds: string[] */
export function saveApplication({ id, data, pending, removeIds = [], onProgress }) {
  const fd = new FormData();
  fd.set('data', JSON.stringify(data));
  if (id) fd.set('removeFiles', JSON.stringify(removeIds));
  for (const p of pending) fd.append(`doc__${p.category}`, p.file, p.file.name);
  return send(id ? 'PUT' : 'POST', id ? `/api/applications/${encodeURIComponent(id)}` : '/api/applications', fd, onProgress);
}

export const formUrl = (id) => `/api/applications/${encodeURIComponent(id)}/form.docx`;
export const fileUrl = (id, fileId) => `/api/applications/${encodeURIComponent(id)}/files/${fileId}`;
