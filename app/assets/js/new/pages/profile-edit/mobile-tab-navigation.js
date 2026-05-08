// Handles the portrait-only mobile tabs for profile edit cards
(function () {
    function initMobileTabNavigation() {
        const tabGroup = document.querySelector('#tab-panel-edit .mobile-card-tab-group');
        const cardContainer = document.querySelector('#tab-panel-edit .profile-cards-container');
        if (!tabGroup || !cardContainer) return;

        const tabs = Array.from(tabGroup.querySelectorAll('.mobile-card-tab'));
        if (!tabs.length) return;

        const portraitMatcher = window.matchMedia('(max-width: 480px) and (orientation: portrait)');

        function setActiveTab(activeTab) {
            tabs.forEach(tab => tab.classList.toggle('active', tab === activeTab));
        }

        function scrollToCard(cardEl) {
            if (!cardEl) return;
            if (portraitMatcher.matches) {
                const left = cardEl.offsetLeft;
                if (typeof cardContainer.scrollTo === 'function') {
                    cardContainer.scrollTo({ left, behavior: 'smooth' });
                } else {
                    cardContainer.scrollLeft = left;
                }
            } else {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        tabs.forEach(tab => {
            tab.addEventListener('click', event => {
                event.preventDefault();
                const targetId = (tab.getAttribute('href') || '').replace('#', '');
                const targetCard = targetId ? document.getElementById(targetId) : null;
                scrollToCard(targetCard);
                setActiveTab(tab);
            });
        });

        let scrollTimeoutId = null;
        cardContainer.addEventListener('scroll', () => {
            if (!portraitMatcher.matches) return;
            if (scrollTimeoutId) {
                clearTimeout(scrollTimeoutId);
            }

            scrollTimeoutId = setTimeout(() => {
                const containerCenter = cardContainer.scrollLeft + (cardContainer.clientWidth / 2);
                let closestTab = null;
                let smallestDistance = Number.POSITIVE_INFINITY;

                tabs.forEach(tab => {
                    const targetId = (tab.getAttribute('href') || '').replace('#', '');
                    const targetCard = targetId ? document.getElementById(targetId) : null;
                    if (!targetCard) return;

                    const cardCenter = targetCard.offsetLeft + (targetCard.offsetWidth / 2);
                    const distance = Math.abs(containerCenter - cardCenter);
                    if (distance < smallestDistance) {
                        smallestDistance = distance;
                        closestTab = tab;
                    }
                });

                if (closestTab) {
                    setActiveTab(closestTab);
                }
            }, 100);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMobileTabNavigation);
    } else {
        initMobileTabNavigation();
    }
})();
