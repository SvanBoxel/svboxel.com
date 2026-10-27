// Links and the native version picker work without JavaScript.
const versionPicker = document.querySelector('.version-picker');

if (versionPicker) {
  document.addEventListener('click', (event) => {
    if (!versionPicker.contains(event.target)) versionPicker.open = false;
  });

  versionPicker.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && versionPicker.open) {
      versionPicker.open = false;
      versionPicker.querySelector('summary').focus();
      event.preventDefault();
    }
  });
}
