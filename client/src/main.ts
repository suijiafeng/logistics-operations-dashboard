import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { installDesignTokens } from './design/tokens'

installDesignTokens()
createApp(App).use(createPinia()).mount('#app')
