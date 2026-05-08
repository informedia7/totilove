(function () {
  if (window.__eyeLiveDebugInstalled) {
    console.log('[eye-live-debug] already installed');
    return;
  }
  window.__eyeLiveDebugInstalled = true;
  window.__eyeLiveDebugEvents = [];

  function pushEvent(type, payload) {
    const entry = {
      ts: new Date().toISOString(),
      type,
      payload: payload || {}
    };
    window.__eyeLiveDebugEvents.push(entry);
    if (window.__eyeLiveDebugEvents.length > 300) {
      window.__eyeLiveDebugEvents.shift();
    }
    console.log('[eye-live-debug]', type, payload || {});
  }

  function getPoint(event) {
    const point = event && event.changedTouches && event.changedTouches[0]
      ? event.changedTouches[0]
      : event;
    return {
      x: point && typeof point.clientX === 'number' ? point.clientX : null,
      y: point && typeof point.clientY === 'number' ? point.clientY : null
    };
  }

  function isPointInsideRect(point, rect) {
    if (!point || point.x == null || point.y == null || !rect) {
      return false;
    }
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }

  function inspectBranch(event) {
    const target = event.target;
    const card = target && target.closest ? target.closest('.uc-card') : null;
    if (!card) {
      return;
    }

    const profileId = card.dataset ? card.dataset.profileId : null;
    const quickAction = target.closest ? target.closest('.uc-quick-action') : null;
    const actionButton = target.closest ? target.closest('[data-action]') : null;
    const imageContainer = target.closest ? target.closest('.uc-image-container') : null;

    const activeImageContainer = card.querySelector('.uc-image-container.uc-show-actions');
    const centeredViewButton = activeImageContainer
      ? activeImageContainer.querySelector('.uc-quick-action-view')
      : null;

    const overlayTarget = target.closest
      ? target.closest('.uc-image-container, .uc-quick-actions, .uc-card')
      : null;
    const fallbackImageContainer = overlayTarget
      ? overlayTarget.closest('.uc-image-container') || card.querySelector('.uc-image-container')
      : null;
    const fallbackViewButton = fallbackImageContainer
      ? fallbackImageContainer.querySelector('.uc-quick-action-view')
      : null;

    const point = getPoint(event);
    const centeredRect = centeredViewButton && centeredViewButton.getBoundingClientRect
      ? centeredViewButton.getBoundingClientRect()
      : null;
    const fallbackRect = fallbackViewButton && fallbackViewButton.getBoundingClientRect
      ? fallbackViewButton.getBoundingClientRect()
      : null;

    const branch = {
      page: location.pathname,
      profileId,
      targetTag: target ? target.tagName : null,
      targetClass: target && target.className != null ? String(target.className) : null,
      quickActionDetected: !!quickAction,
      quickActionType: quickAction && quickAction.dataset ? quickAction.dataset.action : null,
      actionButtonDetected: !!actionButton,
      actionButtonType: actionButton && actionButton.dataset ? actionButton.dataset.action : null,
      imageContainerDetected: !!imageContainer,
      activeImageContainerDetected: !!activeImageContainer,
      centeredViewExists: !!centeredViewButton,
      centeredViewPointerEvents: centeredViewButton ? getComputedStyle(centeredViewButton).pointerEvents : null,
      centeredViewOpacity: centeredViewButton ? getComputedStyle(centeredViewButton).opacity : null,
      centeredHitTest: isPointInsideRect(point, centeredRect),
      fallbackHitTest: isPointInsideRect(point, fallbackRect),
      point
    };

    pushEvent(event.type + '-branch', branch);

    if (!branch.quickActionDetected && !branch.centeredHitTest && !branch.fallbackHitTest) {
      console.warn('[eye-live-debug] Eye path miss: quickAction=false and hit-tests=false');
    }
    if (branch.centeredViewExists && branch.centeredViewPointerEvents === 'none') {
      console.warn('[eye-live-debug] Eye button pointer-events is none at event time');
    }
  }

  if (window.UserCard && window.UserCard.prototype) {
    const proto = window.UserCard.prototype;

    if (!proto.__eyeDebugPatchedHandleAction) {
      const originalHandleAction = proto.handleAction;
      proto.handleAction = function patchedHandleAction(action, profileId, card) {
        pushEvent('handleAction', {
          action,
          profileId,
          cardProfileId: card && card.dataset ? card.dataset.profileId : null
        });
        return originalHandleAction.call(this, action, profileId, card);
      };
      proto.__eyeDebugPatchedHandleAction = true;
    }

    if (!proto.__eyeDebugPatchedViewProfile) {
      const originalViewProfile = proto.viewProfile;
      proto.viewProfile = function patchedViewProfile(profileId) {
        pushEvent('viewProfile', { profileId });
        return originalViewProfile.call(this, profileId);
      };
      proto.__eyeDebugPatchedViewProfile = true;
    }

    pushEvent('prototype-patched', { ok: true });
  } else {
    pushEvent('prototype-missing', { reason: 'window.UserCard unavailable (reload and run again after page load)' });
  }

  window.addEventListener('view-profile', function (event) {
    pushEvent('event:view-profile', { detail: event && event.detail ? event.detail : null });
  }, true);

  document.addEventListener('click', inspectBranch, true);
  document.addEventListener('touchend', inspectBranch, true);

  window.__printEyeDebugSummary = function () {
    const events = window.__eyeLiveDebugEvents || [];
    const byType = events.reduce(function (acc, item) {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
    console.table(byType);

    const lastBranches = events.filter(function (e) {
      return e.type === 'click-branch' || e.type === 'touchend-branch';
    }).slice(-8);
    console.log('[eye-live-debug] Last branch events:', lastBranches);
    return { byType: byType, lastBranches: lastBranches };
  };

  console.log('[eye-live-debug] installed. Run __printEyeDebugSummary() after tapping eye button.');
})();
