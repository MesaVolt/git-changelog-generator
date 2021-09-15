<template>
  <div id="app">
    <ChangelogGenerator />
  </div>
</template>

<script lang="ts">
import Vue from 'vue';
import ChangelogGenerator from './components/ChangelogGenerator.vue';

export default Vue.extend({
  name: 'App',
  components: {
    ChangelogGenerator
  }
});
</script>

<style lang="scss">
@import url('https://rsms.me/inter/inter.css');
html { font-family: 'Inter', sans-serif; }
@supports (font-variation-settings: normal) {
  html { font-family: 'Inter var', sans-serif; }
}
:root {
  --color-primary: #0064fe;
}
* {
  box-sizing: border-box;
}
html {
  overflow: hidden;
}
body {
  margin: 0;
  color: #081f37;
  background: #eeeeee;
  accent-color: var(--color-primary);
}
#app {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
</style>
