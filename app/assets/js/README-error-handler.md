# Global Error Handler for Totilove

## Overview
The Global Error Handler is a comprehensive error logging and display system that automatically captures and displays JavaScript errors across all pages of the Totilove application.

## Features

### 🛡️ Automatic Error Capture
- **Window Errors**: Catches all uncaught JavaScript errors
- **Promise Rejections**: Captures unhandled promise rejections
- **Console Errors**: Intercepts all `console.error()` calls
- **Fetch Errors**: Monitors HTTP requests and network failures

### 📊 Detailed Error Information
- **Timestamp**: When the error occurred
- **Context**: Page name and error source
- **Message**: Error message and details
- **Stack Trace**: Full JavaScript stack trace
- **Browser Info**: User agent, screen size, language, etc.
- **URL**: Current page URL when error occurred

### 🎨 Visual Error Display
- **Error Badge**: Pulsing red notification badge in bottom-right corner
- **Error Panel**: Detailed error information with expandable sections
- **Error Management**: Copy all errors to clipboard or clear all errors
- **Real-time Updates**: New errors appear immediately

## Usage

### Basic Implementation
Add this to any HTML page to enable error handling:

```html
<!-- Include Global Error Handler -->
{{include:global-error-handler}}
```

### Manual Error Triggering
For testing purposes, you can trigger a test error:

```javascript
// In browser console
triggerTestError();
```

### Programmatic Error Capture
You can manually capture errors in your code:

```javascript
try {
    // Some risky operation
    riskyFunction();
} catch (error) {
    ErrorDisplay.captureError(error, 'Custom Error Context');
}
```

## File Structure

```
app/
├── assets/js/
│   ├── global-error-handler.js    # Main error handler script
│   └── README-error-handler.md    # This documentation
└── components/
    └── global-error-handler.html  # Include component for HTML pages
```

## Error Display Interface

### Error Badge
- **Location**: Bottom-right corner of the page
- **Appearance**: Red pulsing badge with error count
- **Action**: Click to toggle error details panel

### Error Details Panel
- **Location**: Bottom-right corner (when opened)
- **Features**:
  - List of all captured errors
  - Expandable stack traces
  - Browser information
  - Copy all errors button
  - Clear all errors button

## Configuration

### Page Context
The error handler automatically adds page context to errors. You can customize this:

```javascript
// Set custom page context
window.pageContext = {
    pageName: 'User Profile',
    pagePath: '/profile',
    userId: 123
};
```

### Error Filtering
You can filter which errors to display:

```javascript
// Override captureError to filter errors
const originalCaptureError = ErrorDisplay.captureError;
ErrorDisplay.captureError = function(error, context) {
    // Only show errors from specific contexts
    if (context.includes('Critical')) {
        return originalCaptureError.call(this, error, context);
    }
    // Log but don't display other errors
    console.log('Filtered error:', error);
};
```

## Browser Compatibility

- **Modern Browsers**: Full support
- **IE11+**: Basic support (some features may be limited)
- **Mobile Browsers**: Full support

## Performance Impact

- **Minimal**: Error handler has negligible performance impact
- **Memory Efficient**: Errors are stored in memory and can be cleared
- **Non-blocking**: Error capture doesn't interfere with normal page operation

## Troubleshooting

### Error Handler Not Working
1. Check that `global-error-handler.js` is loaded
2. Verify the include component is properly added to your HTML
3. Check browser console for any initialization errors

### Too Many Errors
1. Use the "Clear" button to reset error display
2. Check for infinite error loops in your code
3. Filter errors using custom captureError override

### Missing Error Details
1. Ensure browser supports modern JavaScript features
2. Check that error objects have proper stack traces
3. Verify network requests are being monitored

## Development

### Adding New Error Sources
To capture errors from additional sources, extend the `setupGlobalErrorHandlers` method:

```javascript
// Example: Capture WebSocket errors
window.addEventListener('error', (event) => {
    if (event.target.tagName === 'SCRIPT') {
        ErrorDisplay.captureError(new Error('Script load error'), 'Script Error');
    }
});
```

### Custom Error Display
You can customize the error display by modifying the `displayError` method or creating your own display functions.

## Security Considerations

- **Error Information**: Contains sensitive information (URLs, user agent, etc.)
- **Clipboard Access**: Users can copy error details
- **Memory Usage**: Errors are stored in memory until cleared
- **Production**: Consider disabling detailed error display in production

## License

This error handler is part of the Totilove application and follows the same licensing terms.


