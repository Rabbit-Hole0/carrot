export default defineBackground(() => {
  console.log('====================================');
  console.log('🥕 [Carrot Background] Service worker loaded successfully!');
  console.log('====================================');

  // Add a heartbeat log so the user can see it even if they open the console late
  setInterval(() => {
    console.log('🥕 [Carrot Background] Heartbeat: Background script is running...');
  }, 10000);
});
