'use strict';

(function () {
  const config = {
    apiKey: 'AIzaSyDpCAXfhldRc1nCZDWlWNRbcMFjqAh8uPc',
    authDomain: 'cloud-db-studio.firebaseapp.com',
    databaseURL: 'https://cloud-db-studio-default-rtdb.firebaseio.com',
    projectId: 'cloud-db-studio',
    storageBucket: 'cloud-db-studio.firebasestorage.app',
    messagingSenderId: '343326148662',
    appId: '1:343326148662:web:987738ccc8f9d6a8253097'
  };

  if (!firebase.apps.length) firebase.initializeApp(config);
  window.skBank = firebase.database().ref('sk-bank');
  window.skBankConfig = config;
})();
