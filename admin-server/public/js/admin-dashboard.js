// Admin Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
    const togglePasswordChange = document.getElementById('toggle-password-change');
    const passwordChangeSection = document.getElementById('password-change-section');
    const cancelPasswordChange = document.getElementById('cancel-password-change');
    const passwordChangeForm = document.getElementById('password-change-form');
    const passwordMessage = document.getElementById('password-message');

    // Toggle password change section
    if (togglePasswordChange) {
        togglePasswordChange.addEventListener('click', function () {
            passwordChangeSection.style.display = passwordChangeSection.style.display === 'none' ? 'block' : 'none';
            if (passwordChangeSection.style.display === 'block') {
                passwordChangeSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
    }

    // Cancel password change
    if (cancelPasswordChange) {
        cancelPasswordChange.addEventListener('click', function () {
            passwordChangeSection.style.display = 'none';
            passwordChangeForm.reset();
            passwordMessage.style.display = 'none';
        });
    }

    // Handle password change form submission
    if (passwordChangeForm) {
        passwordChangeForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            const currentPassword = document.getElementById('current-password').value;
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            // Clear previous messages
            passwordMessage.style.display = 'none';
            passwordMessage.className = '';

            // Validation
            if (!currentPassword || !newPassword || !confirmPassword) {
                showMessage('Please fill in all fields', 'error');
                return;
            }

            if (newPassword.length < 8) {
                showMessage('New password must be at least 8 characters long', 'error');
                return;
            }

            if (newPassword !== confirmPassword) {
                showMessage('New passwords do not match', 'error');
                return;
            }

            if (currentPassword === newPassword) {
                showMessage('New password must be different from current password', 'error');
                return;
            }

            // Disable submit button
            const submitBtn = document.getElementById('change-password-btn');
            const originalText = submitBtn.textContent;
            submitBtn.disabled = true;
            submitBtn.textContent = 'Changing...';

            try {
                const response = await fetch('/api/auth/change-password', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        currentPassword,
                        newPassword
                    })
                });

                const data = await response.json();

                if (response.ok && data.success) {
                    showMessage('Password changed successfully!', 'success');
                    passwordChangeForm.reset();
                    setTimeout(() => {
                        passwordChangeSection.style.display = 'none';
                        passwordMessage.style.display = 'none';
                    }, 2000);
                } else {
                    showMessage(data.error || 'Failed to change password', 'error');
                }
            } catch (error) {
                showMessage('An error occurred. Please try again.', 'error');
                console.error('Password change error:', error);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }

    initPresenceDiagnostics();

    function showMessage(message, type) {
        passwordMessage.textContent = message;
        passwordMessage.className = type === 'success' ? 'message-success' : 'message-error';
        passwordMessage.style.display = 'block';
    }

    function initPresenceDiagnostics() {
        const elements = {
            card: document.getElementById('presence-tests-card'),
            runBtn: document.getElementById('run-presence-tests'),
            results: document.getElementById('presence-tests-results'),
            summary: document.getElementById('presence-tests-summary'),
            alert: document.getElementById('presence-tests-alert'),
            lastRun: document.getElementById('presence-tests-last-run'),
            statusChip: document.getElementById('presence-tests-status')
        };

        if (!elements.card || !elements.runBtn || !elements.results || !elements.summary) {
            return;
        }

        const state = {
            running: false,
            buttonLabel: elements.runBtn.textContent
        };

        renderPlaceholder();

        elements.runBtn.addEventListener('click', function () {
            if (state.running) {
                return;
            }
            runDiagnostics();
        });

        async function runDiagnostics() {
            state.running = true;
            elements.runBtn.disabled = true;
            elements.runBtn.textContent = 'Running...';
            setAlert();
            renderLoading();

            try {
                const response = await fetch('/api/presence-tests/run');
                const payload = await response.json();

                if (!response.ok || !payload.success) {
                    throw new Error(payload.error || 'Failed to run diagnostics');
                }

                updateSummary(payload.summary || {});
                renderTests(payload.tests || []);
                setAlert('Diagnostics completed successfully.', 'success');
                if (elements.lastRun) {
                    elements.lastRun.textContent = new Date().toLocaleString();
                }
            } catch (error) {
                renderError(error && error.message ? error.message : 'Unknown error');
                setAlert(error && error.message ? error.message : 'Diagnostics failed', 'error');
            } finally {
                state.running = false;
                elements.runBtn.disabled = false;
                elements.runBtn.textContent = state.buttonLabel;
            }
        }

        function renderPlaceholder() {
            elements.results.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'presence-placeholder';
            const title = document.createElement('h3');
            title.textContent = 'Diagnostics idle';
            const body = document.createElement('p');
            body.textContent = 'Use the Run Diagnostics button to execute the presence tests from this dashboard.';
            placeholder.appendChild(title);
            placeholder.appendChild(body);
            elements.results.appendChild(placeholder);
            updateSummary({ total: 0, passed: 0, failed: 0 });
            setAlert();
        }

        function renderLoading() {
            elements.results.innerHTML = '';
            const loader = document.createElement('div');
            loader.className = 'presence-loading';
            loader.innerHTML = '<div class="presence-loading-spinner"></div><p>Running diagnostics... hang tight.</p>';
            elements.results.appendChild(loader);
        }

        function renderTests(tests) {
            elements.results.innerHTML = '';

            if (!Array.isArray(tests) || !tests.length) {
                renderPlaceholder();
                return;
            }

            tests.forEach((test) => {
                elements.results.appendChild(createTestCard(test));
            });
        }

        function createTestCard(test) {
            const card = document.createElement('div');
            card.className = 'presence-test-card ' + (test.status === 'pass' ? 'pass' : 'fail');

            const header = document.createElement('div');
            header.className = 'presence-test-card-header';

            const title = document.createElement('h4');
            title.textContent = test.label || test.id;
            header.appendChild(title);

            const status = document.createElement('span');
            status.className = 'presence-test-status';
            status.textContent = test.status === 'pass' ? 'Pass' : 'Fail';
            header.appendChild(status);

            card.appendChild(header);

            if (test.description) {
                const desc = document.createElement('p');
                desc.className = 'presence-test-description';
                desc.textContent = test.description;
                card.appendChild(desc);
            }

            const meta = document.createElement('div');
            meta.className = 'presence-test-meta';
            const duration = typeof test.durationMs === 'number' ? test.durationMs + 'ms' : 'n/a';
            meta.textContent = 'Duration: ' + duration;
            card.appendChild(meta);

            if (test.status === 'fail' && test.error) {
                const errorBlock = document.createElement('div');
                errorBlock.className = 'presence-test-error';
                errorBlock.textContent = 'Error: ' + test.error;
                card.appendChild(errorBlock);
            }

            if (test.details) {
                const pre = document.createElement('pre');
                pre.className = 'presence-test-pre';
                pre.textContent = safeStringify(test.details, 2);
                card.appendChild(pre);
            }

            return card;
        }

        function updateSummary(summary) {
            if (!elements.summary) {
                return;
            }

            const summaryConfig = {
                total: '0',
                passed: '0',
                failed: '0',
                usersTested: '—',
                usersPassing: '—'
            };

            Object.entries(summaryConfig).forEach(([key, fallback]) => {
                const node = elements.summary.querySelector('[data-summary="' + key + '"]');
                if (!node) {
                    return;
                }
                const value = summary[key];
                node.textContent = typeof value === 'number'
                    ? value.toLocaleString()
                    : fallback;
            });

            if (elements.statusChip) {
                let label = 'Idle';
                let chipClass = 'presence-status-chip presence-status-idle';

                if (summary.failed > 0) {
                    label = 'Attention required';
                    chipClass = 'presence-status-chip presence-status-fail';
                } else if (summary.total > 0 && summary.passed === summary.total) {
                    label = 'All tests passing';
                    chipClass = 'presence-status-chip presence-status-pass';
                } else if (summary.total > 0) {
                    label = 'Partial pass';
                    chipClass = 'presence-status-chip presence-status-partial';
                }

                elements.statusChip.textContent = label;
                elements.statusChip.className = chipClass;
            }
        }

        function renderError(message) {
            elements.results.innerHTML = '';
            const errorState = document.createElement('div');
            errorState.className = 'presence-placeholder';
            const title = document.createElement('h3');
            title.textContent = 'Diagnostics failed';
            const info = document.createElement('p');
            info.textContent = message;
            errorState.appendChild(title);
            errorState.appendChild(info);
            elements.results.appendChild(errorState);
        }

        function setAlert(message, intent) {
            if (!elements.alert) {
                return;
            }
            if (!message) {
                elements.alert.style.display = 'none';
                elements.alert.textContent = '';
                elements.alert.className = 'presence-tests-alert';
                return;
            }

            let className = 'presence-tests-alert presence-alert-info';
            if (intent === 'success') {
                className = 'presence-tests-alert presence-alert-success';
            } else if (intent === 'error') {
                className = 'presence-tests-alert presence-alert-error';
            }

            elements.alert.textContent = message;
            elements.alert.className = className;
            elements.alert.style.display = 'block';
        }

        function safeStringify(value, spacing) {
            try {
                return JSON.stringify(value, null, spacing);
            } catch (error) {
                return String(value);
            }
        }
    }
});



























