(() => {
  const button = document.querySelector("[data-share]");
  const status = document.querySelector("[data-share-status]");
  if (!button || !status) return;

  button.addEventListener("click", async () => {
    const shareData = {
      title: document.title,
      text: button.dataset.shareText || "SOLYNX contact",
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        status.textContent = "Share sheet opened.";
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(window.location.href);
        status.textContent = "Page link copied.";
        return;
      }
      status.textContent = "Copy this page address from your browser to share it.";
    } catch (error) {
      if (error && error.name === "AbortError") return;
      status.textContent = "Copy this page address from your browser to share it.";
    }
  });
})();
