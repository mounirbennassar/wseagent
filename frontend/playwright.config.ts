import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:30000,use:{baseURL:process.env.HALA_BASE_URL || 'http://127.0.0.1:3000',headless:true},reporter:'list'});
