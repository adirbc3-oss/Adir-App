// Google Apps Script (DB principal)
export const API_URL = "https://script.google.com/macros/s/AKfycbxh3AFJfn84whAI3UYEgm5_2iQttXx0C0DkVWYP8APXlccmb_33BpIyEjxJzN4yebji/exec";

// Backend Python (FastAPI) - Configurable para Oracle Cloud
export const BASE_URL_LOCAL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000/api";

// n8n Webhooks - Configurable para Oracle Cloud
export const N8N_BASE_URL = import.meta.env.VITE_N8N_BASE_URL || "http://localhost:5678";
