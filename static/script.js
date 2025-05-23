// Advanced Trading Data Viewer with TradingView Lightweight Charts
// Requires: https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js

class AdvancedTradingViewer {
    constructor() {
        this.charts = [];
        this.instruments = [];
        this.currentData = {};
        this.drawingTools = [];
        this.drawingMode = null;
        this.activeChartIndex = null; // Track which chart is active for drawing
        this.layout = 1; // 1 or 2 charts
        this.selectedInstruments = [];
        this.supportResistanceEnabled = false;
        this.trendChannelEnabled = false;
        this.breakoutSignalsEnabled = false;
        this.analysisLines = []; // Store S/R and trend lines
        this.breakoutLevels = []; // Track broken S/R levels
        this.signalArrows = []; // Store signal arrows
        this.downloadModalInitialized = false; // Track if download modal has been initialized
        this.timeSync = false; // Track if time sync is enabled
        
        // Data caching
        this.dataCache = {}; // Cache for data requests
        this.cacheTTL = 5 * 60 * 1000; // Cache time-to-live: 5 minutes
        this.pendingRequests = {}; // Track in-progress data requests
        this.lastRequestParams = {}; // Track last request parameters for each instrument
        
        // Track data loading state
        this.isLoadingData = false; // Flag to track if data is currently being loaded
        this.dataLoadQueue = []; // Queue for pending data load requests
        
        // Set up global error handler for chart library
        this.setupGlobalErrorHandlers();
        
        this.customIntervals = {
            '1s': 1/60,
            '5s': 5/60,
            '15s': 15/60,
            '30s': 30/60,
            '2min': 2,
            '3min': 3,
            '10min': 10,
            '20min': 20,
            '45min': 45,
            '90min': 90,
            '3h': 180,
            '6h': 360,
            '12h': 720,
            '2d': 2880,
            '3d': 4320,
            '1w': 10080
        };
        
        this.init();
    }

    setupGlobalErrorHandlers() {
        // Add global error handler for unhandled errors
        window.addEventListener('error', (event) => {
            // Check if the error is from the chart library
            if (event.filename && event.filename.includes('lightweight-charts')) {
                console.error('Chart library error:', event.message);
                
                // Prevent the default error handling
                event.preventDefault();
                
                // Show a user-friendly message
                this.showMessage('Chart rendering error. Try refreshing or changing timeframe.', 'error');
                
                // Try to recover by recreating the chart layout after a short delay
                setTimeout(() => {
                    try {
                        this.createChartLayout();
                    } catch (e) {
                        console.error('Failed to recover from chart error:', e);
                    }
                }, 2000);
                
                return true; // Prevent the error from bubbling up
            }
            
            return false; // Let other errors bubble up
        });
        
        // Add unhandled promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            
            // Check if it's a chart-related error
            if (event.reason && event.reason.message && 
                (event.reason.message.includes('null') || 
                 event.reason.message.includes('undefined') || 
                 event.reason.stack && event.reason.stack.includes('lightweight-charts'))) {
                
                // Prevent the default error handling
                event.preventDefault();
                
                // Show a user-friendly message
                this.showMessage('Data processing error. Try refreshing or changing timeframe.', 'error');
                
                return true; // Prevent the error from bubbling up
            }
            
            return false; // Let other errors bubble up
        });
    }
    
    async init() {
        try {
            console.log('Initializing Advanced Trading Viewer...');
            
            await this.loadInstruments();
            await this.loadSavedDrawingsList();
            this.setupUI();
            this.setupEventListeners();
            this.setupInstrumentEventListeners();
            
            // Add a small delay before creating charts to ensure DOM is ready
            await new Promise(resolve => setTimeout(resolve, 100));
            
            this.createChartLayout();
            
            // Auto-load data if we have a selected instrument
            if (this.selectedInstruments[0]) {
                console.log('Auto-loading data for:', this.selectedInstruments[0]);
                setTimeout(() => {
                    this.loadAllData();
                }, 500); // Short delay to ensure charts are ready
            }
            
            console.log('Initialization complete');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize application');
        }
    }

    async loadInstruments() {
        const response = await fetch('/api/instruments');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.instruments = await response.json();
        this.populateInstrumentSelects();
    }

    setupUI() {
        // Add custom timeframe options
        const timeframeSelect = document.getElementById('timeframeSelect');
        if (timeframeSelect) {
            // Add custom intervals
            Object.keys(this.customIntervals).forEach(interval => {
                const option = document.createElement('option');
                option.value = interval;
                option.textContent = interval.toUpperCase();
                timeframeSelect.appendChild(option);
            });
        }
        
        // The second instrument dropdown is now part of the HTML
        // We just need to make sure it's properly populated
        this.populateInstrumentSelects();
    }

    populateInstrumentSelects() {
        const selects = ['instrumentSelect', 'instrumentSelect2'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            // Clear existing options
            if (selectId === 'instrumentSelect') {
                select.innerHTML = '<option value="">Select an instrument...</option>';
            } else {
                select.innerHTML = '<option value="">Select second instrument...</option>';
            }

            // Find the NQ instrument to set as default
            let nqInstrument = null;
            
            this.instruments.forEach(instrument => {
                const option = document.createElement('option');
                option.value = instrument.table_name;
                option.textContent = instrument.display_name;
                
                // Check if this is the NQ instrument
                if (instrument.table_name.includes('NQ') || 
                    instrument.display_name.includes('NQ') || 
                    instrument.display_name.includes('Nasdaq')) {
                    nqInstrument = instrument;
                    if (selectId === 'instrumentSelect') {
                        option.selected = true;
                        // Store as selected instrument
                        this.selectedInstruments[0] = instrument.table_name;
                    }
                }
                
                select.appendChild(option);
            });
            
            // If NQ wasn't found but we have instruments, select the first one as default
            if (!nqInstrument && this.instruments.length > 0 && selectId === 'instrumentSelect') {
                select.options[1].selected = true; // First instrument after the placeholder
                this.selectedInstruments[0] = this.instruments[0].table_name;
            }
        });
        
        console.log('Default instrument set:', this.selectedInstruments[0]);
    }

    setupEventListeners() {
        // Add second chart button
        document.getElementById('addInstrumentBtn')?.addEventListener('click', () => {
            // Store current data and chart state
            const currentData = {...this.currentData};
            const firstInstrument = this.selectedInstruments[0];
            
            // Switch to dual chart layout
            this.layout = 2;
            
            // Hide the add chart button
            const addBtn = document.getElementById('addInstrumentBtn');
            if (addBtn && addBtn.parentElement) {
                addBtn.parentElement.style.display = 'none';
            }
            
            // Show the second instrument row
            this.toggleSecondInstrument();
            
            // Set ES as default for second chart if available
            this.setDefaultSecondInstrument();
            
            // Create the new chart layout
            this.createChartLayout();
            
            // Restore first chart data if available
            if (firstInstrument && currentData[firstInstrument]) {
                console.log(`Restoring data for first chart: ${firstInstrument} with ${currentData[firstInstrument].length} points`);
                this.currentData[firstInstrument] = currentData[firstInstrument];
                
                // Ensure the chart is created before rendering data
                setTimeout(() => {
                    this.renderDataToChart(0, this.currentData[firstInstrument], firstInstrument);
                }, 50);
            }
            
            // Load data for both charts simultaneously
            setTimeout(() => {
                this.loadAllData();
            }, 100); // Short delay to ensure charts are ready
        });
        
        // Remove second chart button
        document.getElementById('removeInstrumentBtn')?.addEventListener('click', () => {
            // Switch back to single chart layout
            this.layout = 1;
            
            // Show the add chart button again
            const addBtnParent = document.querySelector('.control-group:nth-child(5)');
            if (addBtnParent) {
                addBtnParent.style.display = '';
            }
            
            // Hide the second instrument row
            this.toggleSecondInstrument();
            this.createChartLayout();
            
            // Auto-load data after layout change
            setTimeout(() => {
                this.loadAllData();
            }, 100); // Short delay to ensure charts are ready
        });
    }
    
    setDefaultSecondInstrument() {
        // Find ES instrument and set as default for second chart
        const select = document.getElementById('instrumentSelect2');
        if (!select) return;
        
        // Look for ES in the instruments
        let esInstrument = null;
        
        for (const instrument of this.instruments) {
            if (instrument.table_name.includes('ES') || 
                instrument.display_name.includes('ES') || 
                instrument.display_name.includes('S&P') || 
                instrument.display_name.includes('S&P 500')) {
                esInstrument = instrument;
                break;
            }
        }
        
        if (esInstrument) {
            // Set as selected in dropdown
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value === esInstrument.table_name) {
                    select.options[i].selected = true;
                    // Store as selected instrument
                    this.selectedInstruments[1] = esInstrument.table_name;
                    break;
                }
            }
        } else if (this.instruments.length > 0) {
            // If ES not found, select the first instrument
            select.options[1].selected = true; // First instrument after placeholder
            this.selectedInstruments[1] = this.instruments[0].table_name;
        }
    }
    
    setupInstrumentEventListeners() {
        // Instrument selections with auto-load
        document.getElementById('instrumentSelect')?.addEventListener('change', (e) => {
            this.selectedInstruments[0] = e.target.value;
            this.loadAllData(); // Auto-load when instrument changes
        });

        document.getElementById('instrumentSelect2')?.addEventListener('change', (e) => {
            this.selectedInstruments[1] = e.target.value;
            this.loadAllData(); // Auto-load when instrument changes
        });
        
        // Timeframe selection with auto-load
        document.getElementById('timeframeSelect')?.addEventListener('change', () => {
            this.loadAllData(); // Auto-load when timeframe changes
        });
        
        // Date inputs with auto-load
        document.getElementById('startDateInput')?.addEventListener('change', () => {
            this.loadAllData(); // Auto-load when start date changes
        });
        
        document.getElementById('endDateInput')?.addEventListener('change', () => {
            this.loadAllData(); // Auto-load when end date changes
        });

        // Load data button with force reload option
        document.getElementById('loadDataBtn')?.addEventListener('click', (e) => {
            // Force reload if Shift key is pressed
            const forceReload = e.shiftKey;
            if (forceReload) {
                console.log('Force reloading data (cache cleared)');
                this.showMessage('Force reloading data (cache cleared)', 'info');
            }
            this.loadAllData(forceReload);
        });
        
        // Add a tooltip to the load data button
        const loadDataBtn = document.getElementById('loadDataBtn');
        if (loadDataBtn) {
            loadDataBtn.title = 'Click to load data. Hold Shift while clicking to force reload (bypass cache).';
        }

        // Drawing tools - main buttons in the second desk
        document.getElementById('hLineBtn')?.addEventListener('click', () => {
            this.setDrawingMode('hline');
        });

        document.getElementById('hRayBtn')?.addEventListener('click', () => {
            this.setDrawingMode('hray');
        });

        document.getElementById('rectBtn')?.addEventListener('click', () => {
            this.setDrawingMode('rectangle');
        });

        document.getElementById('clearBtn')?.addEventListener('click', () => {
            this.clearAllDrawings();
        });

        // Download functionality
        document.getElementById('downloadBtn')?.addEventListener('click', () => {
            this.openDownloadModal();
        });

        // Drawing save/load functionality
        document.getElementById('saveDrawingsBtn')?.addEventListener('click', () => {
            this.saveDrawings();
        });

        document.getElementById('deleteDrawingsBtn')?.addEventListener('click', () => {
            this.deleteDrawings();
        });

        document.getElementById('savedDrawingsSelect')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.loadDrawings(e.target.value);
            }
        });

        // Technical analysis toggles
        document.getElementById('supportResistanceToggle')?.addEventListener('change', (e) => {
            this.supportResistanceEnabled = e.target.checked;
            this.toggleBreakoutSignals();
            this.updateTechnicalAnalysis();
        });

        document.getElementById('trendChannelToggle')?.addEventListener('change', (e) => {
            this.trendChannelEnabled = e.target.checked;
            this.updateTechnicalAnalysis();
        });

        document.getElementById('breakoutSignalsToggle')?.addEventListener('change', (e) => {
            this.breakoutSignalsEnabled = e.target.checked;
            if (this.breakoutSignalsEnabled) {
                this.detectBreakoutSignals();
            } else {
                this.clearSignalArrows();
            }
        });
        
        // Time synchronization toggle
        document.getElementById('syncTimeToggle')?.addEventListener('change', (e) => {
            this.timeSync = e.target.checked;
            this.applySyncTimeSettings();
        });
    }

    toggleSecondInstrument() {
        // Show/hide the second instrument row
        const row = document.getElementById('instrument2Row');
        if (row) {
            row.style.display = this.layout === 2 ? 'flex' : 'none';
        }
        
        // If switching to single chart, disable time sync
        if (this.layout === 1 && this.timeSync) {
            this.timeSync = false;
            const syncToggle = document.getElementById('syncTimeToggle');
            if (syncToggle) {
                syncToggle.checked = false;
            }
        }
    }
    
    applySyncTimeSettings() {
        // Only apply if we have 2 charts
        if (this.layout !== 2 || this.charts.length < 2) {
            return;
        }
        
        if (this.timeSync) {
            // Enable synchronization between charts
            this.syncChartTimeScales();
        } else {
            // Disable synchronization
            this.unsyncChartTimeScales();
        }
    }
    
    syncChartTimeScales() {
        if (this.charts.length < 2) return;
        
        const chart1 = this.charts[0].chart;
        const chart2 = this.charts[1].chart;
        
        if (!chart1 || !chart2) return;
        
        // Store original time scales to restore if needed
        this.originalTimeScales = {
            chart1: chart1.timeScale().options(),
            chart2: chart2.timeScale().options()
        };
        
        // Apply consistent options to both charts to ensure similar behavior
        const commonOptions = {
            rightBarStaysOnScroll: true,
            lockVisibleTimeRangeOnResize: true,
            shiftVisibleRangeOnNewBar: true,
            fixLeftEdge: true,
            // Prevent auto-scaling which can cause zoom issues
            autoscaleInfoProvider: () => ({
                priceRange: {
                    minValue: 0,
                    maxValue: 0
                },
                margins: {
                    above: 0,
                    below: 0
                }
            })
        };
        
        chart1.timeScale().applyOptions(commonOptions);
        chart2.timeScale().applyOptions(commonOptions);
        
        // Set up the synchronization handlers for time scales
        const syncHandler1 = () => {
            if (!this.timeSync) return;
            
            // Get visible range from chart 1
            const visibleRange = chart1.timeScale().getVisibleRange();
            if (visibleRange) {
                // Apply to chart 2
                chart2.timeScale().setVisibleRange(visibleRange);
            }
        };
        
        const syncHandler2 = () => {
            if (!this.timeSync) return;
            
            // Get visible range from chart 2
            const visibleRange = chart2.timeScale().getVisibleRange();
            if (visibleRange) {
                // Apply to chart 1
                chart1.timeScale().setVisibleRange(visibleRange);
            }
        };
        
        // Subscribe to time scale changes
        chart1.timeScale().subscribeVisibleTimeRangeChange(syncHandler1);
        chart2.timeScale().subscribeVisibleTimeRangeChange(syncHandler2);
        
        // Store the handlers for later removal
        this.syncHandlers = {
            chart1: syncHandler1,
            chart2: syncHandler2
        };
        
        // Set up crosshair synchronization
        const chart1Element = document.getElementById('chart1');
        const chart2Element = document.getElementById('chart2');
        
        if (chart1Element && chart2Element) {
            // Use a flag to prevent infinite recursion
            let isSyncing = false;
            
            // Sync crosshair from chart 1 to chart 2
            chart1Element.addEventListener('mousemove', (e) => {
                if (!this.timeSync || isSyncing) return;
                
                try {
                    // Set flag to prevent recursion
                    isSyncing = true;
                    
                    // Get coordinates relative to chart1
                    const rect1 = chart1Element.getBoundingClientRect();
                    const x = e.clientX - rect1.left;
                    
                    // Calculate the same relative position for chart2
                    const rect2 = chart2Element.getBoundingClientRect();
                    const chart2X = x * (rect2.width / rect1.width);
                    
                    // Only dispatch if mouse is over chart1 and not a synthetic event
                    if (e.target.closest('#chart1')) {
                        // Update chart2's crosshair directly using the chart API if available
                        if (this.charts[1] && this.charts[1].chart) {
                            try {
                                // Force the crosshair to be visible
                                this.charts[1].chart.applyOptions({
                                    crosshair: {
                                        vertLine: {
                                            visible: true,
                                            width: 2,
                                            color: 'rgba(0, 120, 215, 0.9)',
                                        }
                                    }
                                });
                                
                                // Use the chart API to set crosshair position if available
                                if (typeof this.charts[1].chart.setCrosshairPosition === 'function') {
                                    const price = null; // Let the chart determine the price
                                    const series = this.charts[1].candlestickSeries;
                                    
                                    // Ensure we're passing the correct series object and valid coordinates
                                    if (series && !isNaN(chart2X) && chart2X >= 0) {
                                        this.charts[1].chart.setCrosshairPosition(price, chart2X, series);
                                    }
                                }
                            } catch (err) {
                                console.error('Error setting crosshair position:', err);
                            }
                        } else {
                            // Fallback to synthetic event if API not available
                            const moveEvent = new MouseEvent('mousemove', {
                                clientX: rect2.left + chart2X,
                                clientY: e.clientY,
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            chart2Element.dispatchEvent(moveEvent);
                        }
                    }
                } finally {
                    // Always reset the flag
                    isSyncing = false;
                }
            });
            
            // Sync crosshair from chart 2 to chart 1
            chart2Element.addEventListener('mousemove', (e) => {
                if (!this.timeSync || isSyncing) return;
                
                try {
                    // Set flag to prevent recursion
                    isSyncing = true;
                    
                    // Get coordinates relative to chart2
                    const rect2 = chart2Element.getBoundingClientRect();
                    const x = e.clientX - rect2.left;
                    
                    // Calculate the same relative position for chart1
                    const rect1 = chart1Element.getBoundingClientRect();
                    const chart1X = x * (rect1.width / rect2.width);
                    
                    // Only dispatch if mouse is over chart2
                    if (e.target.closest('#chart2')) {
                        // Update chart1's crosshair directly using the chart API if available
                        if (this.charts[0] && this.charts[0].chart) {
                            try {
                                // Force the crosshair to be visible
                                this.charts[0].chart.applyOptions({
                                    crosshair: {
                                        vertLine: {
                                            visible: true,
                                            width: 2,
                                            color: 'rgba(0, 120, 215, 0.9)',
                                        }
                                    }
                                });
                                
                                // Use the chart API to set crosshair position if available
                                if (typeof this.charts[0].chart.setCrosshairPosition === 'function') {
                                    const price = null; // Let the chart determine the price
                                    const series = this.charts[0].candlestickSeries;
                                    
                                    // Ensure we're passing the correct series object and valid coordinates
                                    if (series && !isNaN(chart1X) && chart1X >= 0) {
                                        this.charts[0].chart.setCrosshairPosition(price, chart1X, series);
                                    }
                                }
                            } catch (err) {
                                console.error('Error setting crosshair position:', err);
                            }
                        } else {
                            // Fallback to synthetic event if API not available
                            const moveEvent = new MouseEvent('mousemove', {
                                clientX: rect1.left + chart1X,
                                clientY: e.clientY,
                                bubbles: true,
                                cancelable: true,
                                view: window
                            });
                            chart1Element.dispatchEvent(moveEvent);
                        }
                    }
                } finally {
                    // Always reset the flag
                    isSyncing = false;
                }
            });
        }
        
        // Initial sync from chart 1 to chart 2
        syncHandler1();
        
        // Set up custom mouse event handling for synchronized charts
        // We'll implement a custom solution to ensure consistent panning behavior
        
        // Track mouse state
        let isDragging = false;
        let lastMouseX = 0;
        
        // Function to handle panning both charts
        const panBothCharts = (deltaX) => {
            if (!this.timeSync || !isDragging) return;
            
            // Get current visible ranges
            const visibleRange1 = chart1.timeScale().getVisibleRange();
            const visibleRange2 = chart2.timeScale().getVisibleRange();
            
            if (!visibleRange1 || !visibleRange2) return;
            
            // Calculate the time difference per pixel
            const chart1Width = chart1Element.clientWidth;
            const timePerPixel = (visibleRange1.to - visibleRange1.from) / chart1Width;
            
            // Calculate time delta based on mouse movement
            const timeDelta = timePerPixel * deltaX;
            
            // Apply the same time shift to both charts
            const newRange1 = {
                from: visibleRange1.from - timeDelta,
                to: visibleRange1.to - timeDelta
            };
            
            const newRange2 = {
                from: visibleRange2.from - timeDelta,
                to: visibleRange2.to - timeDelta
            };
            
            // Apply the new ranges
            chart1.timeScale().setVisibleRange(newRange1);
            chart2.timeScale().setVisibleRange(newRange2);
        };
        
        // Mouse down event - start tracking for drag
        const handleMouseDown = (e) => {
            if (!this.timeSync) return;
            
            isDragging = true;
            lastMouseX = e.clientX;
            
            // Prevent default to avoid text selection during drag
            e.preventDefault();
        };
        
        // Mouse move event - handle panning if dragging
        const handleMouseMove = (e) => {
            if (!this.timeSync || !isDragging) return;
            
            const deltaX = e.clientX - lastMouseX;
            if (deltaX !== 0) {
                panBothCharts(deltaX);
                lastMouseX = e.clientX;
            }
            
            // Prevent default to avoid unwanted browser behavior
            e.preventDefault();
        };
        
        // Mouse up event - stop tracking drag
        const handleMouseUp = () => {
            isDragging = false;
        };
        
        // Add event listeners to both chart elements
        chart1Element.addEventListener('mousedown', handleMouseDown);
        chart2Element.addEventListener('mousedown', handleMouseDown);
        
        // Add move and up listeners to document to capture events outside the charts
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        
        // Store the event handlers for cleanup
        this.syncMouseHandlers = {
            mouseDown: handleMouseDown,
            mouseMove: handleMouseMove,
            mouseUp: handleMouseUp
        };
        
        console.log('Time scales and crosshairs synchronized between charts');
    }
    
    unsyncChartTimeScales() {
        if (this.charts.length < 2 || !this.syncHandlers) return;
        
        const chart1 = this.charts[0].chart;
        const chart2 = this.charts[1].chart;
        
        if (!chart1 || !chart2) return;
        
        // Unsubscribe from time scale changes
        if (this.syncHandlers.chart1) {
            chart1.timeScale().unsubscribeVisibleTimeRangeChange(this.syncHandlers.chart1);
        }
        
        if (this.syncHandlers.chart2) {
            chart2.timeScale().unsubscribeVisibleTimeRangeChange(this.syncHandlers.chart2);
        }
        
        // Restore original time scales if available
        if (this.originalTimeScales) {
            chart1.timeScale().applyOptions(this.originalTimeScales.chart1);
            chart2.timeScale().applyOptions(this.originalTimeScales.chart2);
        }
        
        // Remove custom mouse event handlers
        if (this.syncMouseHandlers) {
            const chart1Element = document.getElementById('chart1');
            const chart2Element = document.getElementById('chart2');
            
            if (chart1Element) {
                chart1Element.removeEventListener('mousedown', this.syncMouseHandlers.mouseDown);
            }
            
            if (chart2Element) {
                chart2Element.removeEventListener('mousedown', this.syncMouseHandlers.mouseDown);
            }
            
            document.removeEventListener('mousemove', this.syncMouseHandlers.mouseMove);
            document.removeEventListener('mouseup', this.syncMouseHandlers.mouseUp);
            
            this.syncMouseHandlers = null;
        }
        
        // Clear handlers
        this.syncHandlers = null;
        
        console.log('Time scales unsynchronized');
    }
    
    resetChartView(chartIndex) {
        if (chartIndex < 0 || chartIndex >= this.charts.length) return;
        
        const chartObj = this.charts[chartIndex];
        if (!chartObj || !chartObj.chart) return;
        
        const chart = chartObj.chart;
        
        // Reset to fit all data
        chart.timeScale().fitContent();
        
        // If we have candlestick series, ensure price scale is also reset
        if (chartObj.candlestickSeries) {
            chart.priceScale('right').applyOptions({
                autoScale: true,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.2,
                },
            });
        }
        
        console.log(`Reset view for chart ${chartIndex + 1}`);
    }

    createChartLayout() {
        try {
            // Check if LightweightCharts is available
            if (typeof window.LightweightCharts === 'undefined') {
                console.error('LightweightCharts library not loaded');
                this.showError('Failed to load charting library. Please refresh the page.');
                return;
            }
            
            // Add a MutationObserver to remove TradingView logo
            this.setupLogoRemoval();
            
            // Debug the LightweightCharts object to check available methods
            console.log('LightweightCharts methods:', Object.getOwnPropertyNames(window.LightweightCharts));
            if (window.LightweightCharts.version) {
                console.log('LightweightCharts version:', window.LightweightCharts.version());
            }

            // Store current data before clearing charts
            const currentDataBackup = {...this.currentData};
            
            // Clear existing charts
            this.charts.forEach(chartObj => {
                try {
                    // The chart object is stored in the 'chart' property
                    if (chartObj && chartObj.chart) {
                        // LightweightCharts doesn't have a remove method, so we need to clean up manually
                        const container = chartObj.chart.chartElement.parentElement;
                        if (container) {
                            container.innerHTML = '';
                        }
                    }
                } catch (e) {
                    console.error('Error removing chart:', e);
                }
            });
            this.charts = [];
            
            // Restore the data after clearing charts
            this.currentData = currentDataBackup;

            const chartContainer = document.getElementById('chart');
            if (!chartContainer) {
                console.error('Chart container not found');
                return;
            }

            chartContainer.innerHTML = '';
            chartContainer.style.display = 'flex';
            chartContainer.style.flexDirection = 'column'; // Always column for stacked charts
            chartContainer.style.gap = '20px';
            chartContainer.style.width = '100%';
            chartContainer.style.height = this.layout === 1 ? '600px' : '900px'; // Taller for dual charts
            chartContainer.style.minHeight = this.layout === 1 ? '600px' : '900px';

            // Create chart containers
            for (let i = 0; i < this.layout; i++) {
                // Create a wrapper div for chart and controls
                const chartWrapper = document.createElement('div');
                chartWrapper.style.position = 'relative';
                
                if (this.layout === 1) {
                    // Single chart - full height
                    chartWrapper.style.height = '100%';
                    chartWrapper.style.minHeight = '500px';
                    chartWrapper.style.width = '100%';
                } else {
                    // Stacked charts - full width, equal height
                    chartWrapper.style.height = '48%'; // Slightly less than 50% to account for gap
                    chartWrapper.style.minHeight = '400px';
                    chartWrapper.style.width = '100%';
                }
                
                // Create the chart div
                const chartDiv = document.createElement('div');
                chartDiv.id = `chart${i + 1}`;
                chartDiv.style.height = '100%';
                chartDiv.style.width = '100%';
                
                // Create reset zoom button (initially hidden)
                const resetButton = document.createElement('button');
                resetButton.id = `resetZoom${i + 1}`;
                resetButton.className = 'reset-zoom-btn';
                resetButton.textContent = 'Reset View';
                resetButton.style.position = 'absolute';
                resetButton.style.top = '10px';
                resetButton.style.right = '10px';
                resetButton.style.zIndex = '100';
                resetButton.style.display = 'none'; // Initially hidden
                resetButton.addEventListener('click', () => this.resetChartView(i));
                
                // Add elements to the wrapper
                chartWrapper.appendChild(chartDiv);
                chartWrapper.appendChild(resetButton);
                chartContainer.appendChild(chartWrapper);

                try {
                    // Ensure the chart div has proper dimensions
                    if (chartDiv.clientWidth === 0) {
                        chartDiv.style.width = '100%';
                    }
                    if (chartDiv.clientHeight === 0) {
                        chartDiv.style.height = this.layout === 1 ? '500px' : '450px';
                    }
                    
                    // Force a reflow to ensure dimensions are calculated correctly
                    chartDiv.getBoundingClientRect();
                    
                    console.log(`Creating chart ${i+1} with dimensions:`, chartDiv.clientWidth, chartDiv.clientHeight);
                    
                    console.log('LightweightCharts object:', window.LightweightCharts);
                    
                    // Create Lightweight Chart with explicit dimensions
                    const chart = window.LightweightCharts.createChart(chartDiv, {
                        width: chartDiv.clientWidth || 800,
                        height: chartDiv.clientHeight || 500,
                        layout: {
                            background: { type: 'solid', color: '#ffffff' },
                            textColor: '#333333',
                        },
                        grid: {
                            vertLines: { color: '#f0f3fa' },
                            horzLines: { color: '#f0f3fa' },
                        },
                        crosshair: {
                            mode: 0, // Normal mode
                            vertLine: {
                                visible: true,
                                labelVisible: false,
                                style: 1, // Solid line
                                width: 2, // Increased width for better visibility
                                color: 'rgba(0, 120, 215, 0.9)', // Brighter blue color
                            },
                            horzLine: {
                                visible: true,
                                labelVisible: true,
                                style: 1, // Solid line
                                width: 1,
                                color: 'rgba(70, 130, 180, 0.8)',
                            },
                        },
                        timeScale: {
                            timeVisible: true,
                            secondsVisible: false,
                            // Configure default behavior for mouse interactions
                            handleScroll: {
                                mouseWheel: true,
                                pressedMouseMove: true, // Enable panning with pressed mouse move
                                horzTouchDrag: true
                            },
                            handleScale: {
                                mouseWheel: true,
                                pinch: true,
                                axisPressedMouseMove: true
                            },
                            // Prevent zooming when panning to the edge
                            rightBarStaysOnScroll: true,
                            fixLeftEdge: true,
                            lockVisibleTimeRangeOnResize: true,
                            // Prevent auto-scaling which can cause zoom issues
                            autoscaleInfoProvider: () => ({
                                priceRange: {
                                    minValue: 0,
                                    maxValue: 0
                                },
                                margins: {
                                    above: 0,
                                    below: 0
                                }
                            })
                        },
                        rightPriceScale: {
                            borderVisible: false,
                        },
                    });

                    // Add candlestick series - updated for Lightweight Charts v5.0.7
                    const candlestickSeries = chart.addSeries(window.LightweightCharts.CandlestickSeries, {
                        upColor: '#26a69a',
                        downColor: '#ef5350',
                        borderVisible: false,
                        wickUpColor: '#26a69a',
                        wickDownColor: '#ef5350',
                    });

                    // Add volume series - updated for Lightweight Charts v5.0.7
                    const volumeSeries = chart.addSeries(window.LightweightCharts.HistogramSeries, {
                        color: '#26a69a',
                        priceFormat: {
                            type: 'volume',
                        },
                        priceScaleId: 'volume',
                    });

                    chart.priceScale('volume').applyOptions({
                        scaleMargins: {
                            top: 0.7,
                            bottom: 0,
                        },
                    });

                    // Store chart reference
                    this.charts.push({
                        chart,
                        candlestickSeries,
                        volumeSeries,
                        drawings: []
                    });

                    // Add click handler for drawing tools
                    this.setupChartDrawing(chart, i);
                    
                    // Show reset button when chart is moved
                    chart.timeScale().subscribeVisibleTimeRangeChange(() => {
                        const resetButton = document.getElementById(`resetZoom${i + 1}`);
                        if (resetButton) {
                            resetButton.style.display = 'block';
                        }
                    });
                } catch (error) {
                    console.error(`Error creating chart ${i + 1}:`, error);
                    
                    // Try creating a simpler chart as fallback
                    try {
                        console.log(`Attempting to create fallback chart ${i + 1}`);
                        
                        // Create a simpler chart with minimal options
                        const chart = window.LightweightCharts.createChart(chartDiv, {
                            width: 800,
                            height: 500,
                            timeScale: {
                                timeVisible: true,
                                rightBarStaysOnScroll: true,
                                fixLeftEdge: true,
                                lockVisibleTimeRangeOnResize: true,
                                // Prevent auto-scaling which can cause zoom issues
                                autoscaleInfoProvider: () => ({
                                    priceRange: {
                                        minValue: 0,
                                        maxValue: 0
                                    },
                                    margins: {
                                        above: 0,
                                        below: 0
                                    }
                                })
                            },
                        });
                        
                        // Add basic candlestick series - updated for Lightweight Charts v5.0.7
                        const candlestickSeries = chart.addSeries(window.LightweightCharts.CandlestickSeries);
                        
                        // Add basic volume series - updated for Lightweight Charts v5.0.7
                        const volumeSeries = chart.addSeries(window.LightweightCharts.HistogramSeries, {
                            priceScaleId: 'volume',
                        });
                        
                        chart.priceScale('volume').applyOptions({
                            scaleMargins: {
                                top: 0.7,
                                bottom: 0,
                            },
                        });
                        
                        // Store chart reference
                        this.charts.push({
                            chart,
                            candlestickSeries,
                            volumeSeries,
                            drawings: []
                        });
                        
                        // Add click handler for drawing tools
                        this.setupChartDrawing(chart, i);
                        
                        console.log(`Fallback chart ${i + 1} created successfully`);
                    } catch (fallbackError) {
                        console.error(`Fallback chart creation also failed:`, fallbackError);
                        
                        // Show error message
                        chartDiv.innerHTML = `
                            <div class="chart-error">
                                <h3>Chart initialization failed</h3>
                                <p>Error: ${error.message}</p>
                                <p>Fallback error: ${fallbackError.message}</p>
                                <p>Please refresh the page to try again.</p>
                                <button onclick="location.reload()">Refresh Page</button>
                            </div>
                        `;
                        chartDiv.style.display = 'flex';
                        chartDiv.style.justifyContent = 'center';
                        chartDiv.style.alignItems = 'center';
                        chartDiv.style.color = 'red';
                        chartDiv.style.border = '1px solid #ddd';
                    }
                }
            }

            // Handle resize
            window.addEventListener('resize', () => {
                this.charts.forEach(({ chart }) => {
                    try {
                        chart.applyOptions({
                            width: chart.options().width,
                            height: chart.options().height
                        });
                    } catch (e) {
                        console.error('Error resizing chart:', e);
                    }
                });
            });
            
            // Apply time synchronization if enabled
            if (this.layout === 2 && this.timeSync) {
                this.applySyncTimeSettings();
            }
        } catch (error) {
            console.error('Error in createChartLayout:', error);
            this.showError('Failed to initialize charts. Please refresh the page.');
        }
    }

    // Helper method to get the exact price at a specific y-coordinate from the DOM
    getExactPriceFromDOM(chart, yCoordinate) {
        try {
            // Get the chart element
            const chartElement = chart.chartElement();
            if (!chartElement) return null;
            
            // Find all price axis labels
            const priceLabels = chartElement.querySelectorAll('.tv-lightweight-charts-price-axis-label');
            if (!priceLabels || priceLabels.length === 0) return null;
            
            // Create an array of labels with their positions and prices
            const labelData = [];
            for (const label of priceLabels) {
                const rect = label.getBoundingClientRect();
                const chartRect = chartElement.getBoundingClientRect();
                
                // Calculate y-coordinate relative to the chart
                const relativeY = rect.top + (rect.height / 2) - chartRect.top;
                
                // Extract price from label text
                const priceText = label.textContent;
                if (priceText) {
                    const cleanPrice = priceText.replace(/[^\d.-]/g, '');
                    const price = parseFloat(cleanPrice);
                    
                    if (!isNaN(price)) {
                        labelData.push({
                            y: relativeY,
                            price: price
                        });
                    }
                }
            }
            
            // Sort by y-coordinate
            labelData.sort((a, b) => a.y - b.y);
            
            // If we have at least two labels, we can interpolate
            if (labelData.length >= 2) {
                // Find the two labels that bracket our y-coordinate
                let lowerLabel = null;
                let upperLabel = null;
                
                for (let i = 0; i < labelData.length - 1; i++) {
                    if (labelData[i].y <= yCoordinate && labelData[i + 1].y >= yCoordinate) {
                        lowerLabel = labelData[i];
                        upperLabel = labelData[i + 1];
                        break;
                    }
                }
                
                // If we found bracketing labels, interpolate
                if (lowerLabel && upperLabel) {
                    const yRange = upperLabel.y - lowerLabel.y;
                    const priceRange = lowerLabel.price - upperLabel.price; // Note: prices are inverted (higher y = lower price)
                    
                    const relativePosition = (yCoordinate - lowerLabel.y) / yRange;
                    const interpolatedPrice = lowerLabel.price - (relativePosition * priceRange);
                    
                    return Math.round(interpolatedPrice * 100) / 100;
                }
                
                // If y is above all labels, use the top label
                if (yCoordinate <= labelData[0].y) {
                    return labelData[0].price;
                }
                
                // If y is below all labels, use the bottom label
                if (yCoordinate >= labelData[labelData.length - 1].y) {
                    return labelData[labelData.length - 1].price;
                }
            }
            
            return null;
        } catch (error) {
            console.warn('Error getting exact price from DOM:', error);
            return null;
        }
    }
    
    // Helper method to extract price from crosshair label
    getCrosshairPrice(chart) {
        try {
            // Try to find the crosshair price label element
            const chartElement = chart.chartElement();
            if (!chartElement) return null;
            
            // Find the price label in the DOM
            const priceLabels = chartElement.querySelectorAll('.tv-lightweight-charts-price-axis-label');
            if (!priceLabels || priceLabels.length === 0) return null;
            
            // Look for the highlighted label (the one at the crosshair position)
            let highlightedLabel = null;
            for (const label of priceLabels) {
                // The highlighted label usually has a different background color
                const computedStyle = window.getComputedStyle(label);
                const backgroundColor = computedStyle.backgroundColor;
                
                // Check if this is the highlighted label (not transparent or white)
                if (backgroundColor && 
                    backgroundColor !== 'transparent' && 
                    backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                    backgroundColor !== 'rgb(255, 255, 255)') {
                    highlightedLabel = label;
                    break;
                }
            }
            
            // If we found a highlighted label, extract the price
            if (highlightedLabel) {
                const priceText = highlightedLabel.textContent;
                if (priceText) {
                    // Convert the text to a number, handling different formats
                    const cleanPrice = priceText.replace(/[^\d.-]/g, '');
                    return parseFloat(cleanPrice);
                }
            }
            
            return null;
        } catch (error) {
            console.warn('Error getting crosshair price:', error);
            return null;
        }
    }
    
    setupChartDrawing(chart, chartIndex) {
        chart.subscribeClick((param) => {
            if (!this.drawingMode || !param.time) return;

            try {
                // In Lightweight Charts v5, we use seriesData instead of seriesPrices
                let price = null;
                
                // First try to get the crosshair price (most accurate to where user is pointing)
                const crosshairOptions = chart.options().crosshair;
                if (crosshairOptions && crosshairOptions.horzLine && crosshairOptions.horzLine.labelVisible) {
                    // Try to get the current crosshair position from the chart
                    if (param.point && typeof param.point.y === 'number') {
                        const priceScale = chart.priceScale('right');
                        if (priceScale) {
                            // In Lightweight Charts v5.0.7, we need a more accurate approach
                            // First, try to get the exact price from the crosshair label if available
                            const crosshairPrice = this.getCrosshairPrice(chart);
                            if (crosshairPrice !== null) {
                                price = crosshairPrice;
                                console.log('Using crosshair label price for drawing:', price);
                            }
                            // If that fails, use the series data at the clicked point
                            else if (param.seriesData && param.seriesData.size > 0) {
                                const firstSeries = Array.from(param.seriesData.values())[0];
                                if (firstSeries) {
                                    price = typeof firstSeries === 'object' ? 
                                        (firstSeries.close || firstSeries.value) : 
                                        firstSeries;
                                    console.log('Using crosshair series data for drawing:', price);
                                }
                            }
                        }
                    }
                }
                
                // Fallback: Get the first available series data if crosshair price not available
                if (!price && param.seriesData && param.seriesData.size > 0) {
                    // Get the first series data entry
                    const firstSeries = Array.from(param.seriesData.values())[0];
                    if (firstSeries) {
                        // Extract price from the data point
                        price = typeof firstSeries === 'object' ? 
                            (firstSeries.close || firstSeries.value) : 
                            firstSeries;
                        console.log('Using series data price for drawing:', price);
                    }
                }
                
                // Final fallback: use the y-coordinate if available
                if (!price && param.point && typeof param.point.y === 'number') {
                    const priceScale = chart.priceScale('right');
                    if (priceScale) {
                        // In v5.0.7, we need a more accurate way to convert coordinate to price
                        // We'll use a more precise method that accounts for price scale margins
                        const priceSeries = this.charts[chartIndex].candlestickSeries;
                        if (priceSeries) {
                            // Get the visible bars
                            const visibleBars = priceSeries.data();
                            if (visibleBars && visibleBars.length > 0) {
                                // Get the price scale options to account for margins
                                const priceScaleOptions = chart.priceScale('right').options();
                                const topMargin = priceScaleOptions.scaleMargins?.top || 0.1;
                                const bottomMargin = priceScaleOptions.scaleMargins?.bottom || 0.2;
                                
                                // Calculate the min and max prices from visible data
                                const minPrice = Math.min(...visibleBars.map(bar => bar.low));
                                const maxPrice = Math.max(...visibleBars.map(bar => bar.high));
                                
                                // Add some padding to the price range (similar to what the chart does)
                                const padding = (maxPrice - minPrice) * 0.1;
                                const extendedMinPrice = minPrice - padding;
                                const extendedMaxPrice = maxPrice + padding;
                                const totalPriceRange = extendedMaxPrice - extendedMinPrice;
                                
                                // Get the chart height
                                const chartHeight = chart.options().height;
                                
                                // Calculate the visible chart area (excluding margins)
                                const visibleChartHeight = chartHeight * (1 - topMargin - bottomMargin);
                                const visibleChartTop = chartHeight * topMargin;
                                
                                // Calculate relative position within the visible chart area
                                // Adjust y-coordinate to be relative to the visible chart area
                                const adjustedY = param.point.y - visibleChartTop;
                                const relativeY = adjustedY / visibleChartHeight;
                                
                                // Calculate price (inverted, as y=0 is top)
                                price = extendedMaxPrice - (relativeY * totalPriceRange);
                                
                                // Round to 2 decimal places for better precision
                                price = Math.round(price * 100) / 100;
                                
                                // Try to get the exact price from the DOM if our estimate seems off
                                const domPrice = this.getExactPriceFromDOM(chart, param.point.y);
                                if (domPrice !== null) {
                                    console.log('DOM price:', domPrice, 'Estimated price:', price);
                                    // If the DOM price is significantly different, use it instead
                                    if (Math.abs(domPrice - price) > 5) {
                                        price = domPrice;
                                    }
                                }
                                
                                console.log('Final price for drawing:', price);
                            }
                        }
                    }
                }
                
                if (!price) {
                    console.warn('Could not determine price for drawing');
                    return;
                }
                
                this.addDrawing(chartIndex, this.drawingMode, {
                    time: param.time,
                    price: typeof price === 'object' ? price.close : price
                });
            } catch (error) {
                console.warn('Error in chart click handler:', error);
            }
        });
    }

    addDrawing(chartIndex, type, point) {
        const chartObj = this.charts[chartIndex];
        if (!chartObj) return;

        const drawing = {
            type,
            id: Date.now(),
            points: [point],
            complete: type === 'hline' || type === 'hray'
        };

        if (type === 'rectangle' && this.drawingTools.length > 0) {
            const lastDrawing = this.drawingTools[this.drawingTools.length - 1];
            if (lastDrawing.type === 'rectangle' && !lastDrawing.complete) {
                lastDrawing.points.push(point);
                lastDrawing.complete = true;
                this.renderDrawing(chartIndex, lastDrawing);
                return;
            }
        }

        this.drawingTools.push(drawing);
        chartObj.drawings.push(drawing);

        if (drawing.complete) {
            this.renderDrawing(chartIndex, drawing);
        }
    }

    renderDrawing(chartIndex, drawing) {
        const chartObj = this.charts[chartIndex];
        if (!chartObj) return;

        switch (drawing.type) {
            case 'hline':
                this.renderHorizontalLine(chartObj, drawing);
                break;
            case 'hray':
                this.renderHorizontalRay(chartObj, drawing);
                break;
            case 'rectangle':
                if (drawing.points.length === 2) {
                    this.renderRectangle(chartObj, drawing);
                }
                break;
        }
    }

    renderHorizontalLine(chartObj, drawing) {
        const price = drawing.points[0].price;
        const line = {
            price,
            color: '#2196F3',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `H-Line ${price.toFixed(4)}`
        };

        chartObj.candlestickSeries.createPriceLine(line);
    }

    renderHorizontalRay(chartObj, drawing) {
        const price = drawing.points[0].price;
        const line = {
            price,
            color: '#FF9800',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dashed,
            axisLabelVisible: true,
            title: `H-Ray ${price.toFixed(4)}`
        };

        chartObj.candlestickSeries.createPriceLine(line);
    }

    renderRectangle(chartObj, drawing) {
        // Create rectangle using price lines (simplified implementation)
        const [point1, point2] = drawing.points;
        const topPrice = Math.max(point1.price, point2.price);
        const bottomPrice = Math.min(point1.price, point2.price);

        const topLine = {
            price: topPrice,
            color: '#9C27B0',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: false,
            title: 'Rectangle Top'
        };

        const bottomLine = {
            price: bottomPrice,
            color: '#9C27B0',
            lineWidth: 1,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: false,
            title: 'Rectangle Bottom'
        };

        chartObj.candlestickSeries.createPriceLine(topLine);
        chartObj.candlestickSeries.createPriceLine(bottomLine);
    }

    setDrawingMode(mode, chartIndex = null) {
        this.drawingMode = this.drawingMode === mode ? null : mode;
        this.activeChartIndex = chartIndex !== null ? chartIndex : null;
        
        // Update tool button states
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (this.drawingMode) {
            const btnId = mode === 'hline' ? 'hLineBtn' : 
                         mode === 'hray' ? 'hRayBtn' : 'rectBtn';
            
            // If we have a specific chart index, activate that specific button
            if (chartIndex !== null) {
                document.getElementById(`${btnId}-${chartIndex}`)?.classList.add('active');
            } else {
                // Otherwise activate the main button
                document.getElementById(btnId)?.classList.add('active');
            }
        }

        // Change cursor for the specific chart or all charts
        if (chartIndex !== null) {
            const chartDiv = document.getElementById(`chart${chartIndex + 1}`);
            if (chartDiv) {
                chartDiv.style.cursor = this.drawingMode ? 'crosshair' : 'default';
            }
        } else {
            document.querySelectorAll('[id^="chart"]').forEach(chartDiv => {
                chartDiv.style.cursor = this.drawingMode ? 'crosshair' : 'default';
            });
        }
    }

    clearAllDrawings() {
        this.drawingTools = [];
        this.charts.forEach(chartObj => {
            chartObj.drawings = [];
            // Note: Lightweight Charts doesn't have a direct way to remove price lines
            // In a full implementation, you'd need to track and remove individual lines
        });
    }
    
    clearDrawings(chartIndex) {
        if (chartIndex !== null && chartIndex >= 0 && chartIndex < this.charts.length) {
            const chartObj = this.charts[chartIndex];
            if (chartObj) {
                chartObj.drawings = [];
                // In a full implementation, you'd need to track and remove individual lines
                console.log(`Cleared drawings for chart ${chartIndex + 1}`);
            }
        }
    }

    // Technical Analysis Methods
    updateTechnicalAnalysis() {
        this.clearAnalysisLines();
        
        this.charts.forEach((chartObj, index) => {
            const instrument = this.selectedInstruments[index];
            if (!instrument || !this.currentData[instrument]) return;
            
            const data = this.currentData[instrument];
            if (data.length < 20) return; // Need minimum data points
            
            if (this.supportResistanceEnabled) {
                this.addSupportResistanceLevels(chartObj, data, index);
            }
            
            if (this.trendChannelEnabled) {
                this.addTrendChannel(chartObj, data, index);
            }
        });
        
        // Detect breakout signals after S/R levels are established
        if (this.supportResistanceEnabled && this.breakoutSignalsEnabled) {
            setTimeout(() => {
                this.detectBreakoutSignals();
            }, 200);
        }
    }

    addSupportResistanceLevels(chartObj, data, chartIndex) {
        const levels = this.detectSupportResistance(data);
        
        levels.support.forEach((level, idx) => {
            const line = {
                price: level.price,
                color: '#00E676',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: `Support ${level.price.toFixed(4)} (${level.touches} touches)`
            };
            
            const priceLine = chartObj.candlestickSeries.createPriceLine(line);
            this.analysisLines.push({ chartIndex, type: 'support', priceLine: priceLine, level: level.price });
        });
        
        levels.resistance.forEach((level, idx) => {
            const line = {
                price: level.price,
                color: '#FF1744',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Dashed,
                axisLabelVisible: true,
                title: `Resistance ${level.price.toFixed(4)} (${level.touches} touches)`
            };
            
            const priceLine = chartObj.candlestickSeries.createPriceLine(line);
            this.analysisLines.push({ chartIndex, type: 'resistance', priceLine: priceLine, level: level.price });
        });
    }

    addTrendChannel(chartObj, data, chartIndex) {
        const channel = this.detectTrendChannel(data);
        if (!channel) return;
        
        const trendColor = channel.direction === 'up' ? '#2196F3' : '#FF9800';
        const opacity = '80';
        
        // Upper trend line
        const upperLine = {
            price: channel.upper.currentPrice,
            color: trendColor + opacity,
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `${channel.direction.toUpperCase()} Channel Upper`
        };
        
        // Lower trend line
        const lowerLine = {
            price: channel.lower.currentPrice,
            color: trendColor + opacity,
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Solid,
            axisLabelVisible: true,
            title: `${channel.direction.toUpperCase()} Channel Lower`
        };
        
        const upperPriceLine = chartObj.candlestickSeries.createPriceLine(upperLine);
        const lowerPriceLine = chartObj.candlestickSeries.createPriceLine(lowerLine);
        
        this.analysisLines.push({ 
            chartIndex, 
            type: 'trend_upper', 
            priceLine: upperPriceLine,
            level: channel.upper.currentPrice,
            direction: channel.direction
        });
        this.analysisLines.push({ 
            chartIndex, 
            type: 'trend_lower', 
            priceLine: lowerPriceLine,
            level: channel.lower.currentPrice,
            direction: channel.direction
        });
    }

    detectSupportResistance(data) {
        const levels = { support: [], resistance: [] };
        const tolerance = this.calculateTolerance(data);
        const minTouches = 2;
        
        // Find pivot points
        const pivots = this.findPivotPoints(data);
        
        // Group similar levels
        pivots.highs.forEach(pivot => {
            const existingLevel = levels.resistance.find(level => 
                Math.abs(level.price - pivot.price) <= tolerance
            );
            
            if (existingLevel) {
                existingLevel.touches++;
                existingLevel.price = (existingLevel.price + pivot.price) / 2;
            } else {
                levels.resistance.push({
                    price: pivot.price,
                    touches: 1,
                    lastTouch: pivot.index
                });
            }
        });
        
        pivots.lows.forEach(pivot => {
            const existingLevel = levels.support.find(level => 
                Math.abs(level.price - pivot.price) <= tolerance
            );
            
            if (existingLevel) {
                existingLevel.touches++;
                existingLevel.price = (existingLevel.price + pivot.price) / 2;
            } else {
                levels.support.push({
                    price: pivot.price,
                    touches: 1,
                    lastTouch: pivot.index
                });
            }
        });
        
        // Filter by minimum touches and sort by strength
        levels.support = levels.support
            .filter(level => level.touches >= minTouches)
            .sort((a, b) => b.touches - a.touches)
            .slice(0, 3);
            
        levels.resistance = levels.resistance
            .filter(level => level.touches >= minTouches)
            .sort((a, b) => b.touches - a.touches)
            .slice(0, 3);
        
        return levels;
    }

    detectTrendChannel(data) {
        if (data.length < 50) return null;
        
        const recentData = data.slice(-50); // Use last 50 candles
        const highs = recentData.map((d, i) => ({ price: d.high, index: i }));
        const lows = recentData.map((d, i) => ({ price: d.low, index: i }));
        
        // Calculate trend lines using linear regression
        const upperTrend = this.calculateTrendLine(highs, 'high');
        const lowerTrend = this.calculateTrendLine(lows, 'low');
        
        if (!upperTrend || !lowerTrend) return null;
        
        // Determine trend direction
        const direction = upperTrend.slope > 0 && lowerTrend.slope > 0 ? 'up' : 
                         upperTrend.slope < 0 && lowerTrend.slope < 0 ? 'down' : 'sideways';
        
        if (direction === 'sideways') return null;
        
        return {
            direction,
            upper: {
                slope: upperTrend.slope,
                intercept: upperTrend.intercept,
                currentPrice: upperTrend.intercept + upperTrend.slope * (recentData.length - 1)
            },
            lower: {
                slope: lowerTrend.slope,
                intercept: lowerTrend.intercept,
                currentPrice: lowerTrend.intercept + lowerTrend.slope * (recentData.length - 1)
            },
            strength: Math.abs(upperTrend.slope) + Math.abs(lowerTrend.slope)
        };
    }

    findPivotPoints(data, lookback = 5) {
        const pivots = { highs: [], lows: [] };
        
        for (let i = lookback; i < data.length - lookback; i++) {
            const current = data[i];
            let isHigh = true, isLow = true;
            
            // Check if current point is higher/lower than surrounding points
            for (let j = i - lookback; j <= i + lookback; j++) {
                if (j === i) continue;
                if (data[j].high >= current.high) isHigh = false;
                if (data[j].low <= current.low) isLow = false;
            }
            
            if (isHigh) pivots.highs.push({ price: current.high, index: i });
            if (isLow) pivots.lows.push({ price: current.low, index: i });
        }
        
        return pivots;
    }

    calculateTrendLine(points, type) {
        if (points.length < 10) return null;
        
        // Filter significant points for trend line calculation
        const filteredPoints = type === 'high' ? 
            points.filter((p, i) => i === 0 || i === points.length - 1 || 
                points.slice(Math.max(0, i-3), i+4).every(pp => pp.price <= p.price)) :
            points.filter((p, i) => i === 0 || i === points.length - 1 || 
                points.slice(Math.max(0, i-3), i+4).every(pp => pp.price >= p.price));
        
        if (filteredPoints.length < 2) return null;
        
        // Linear regression
        const n = filteredPoints.length;
        const sumX = filteredPoints.reduce((sum, p) => sum + p.index, 0);
        const sumY = filteredPoints.reduce((sum, p) => sum + p.price, 0);
        const sumXY = filteredPoints.reduce((sum, p) => sum + p.index * p.price, 0);
        const sumX2 = filteredPoints.reduce((sum, p) => sum + p.index * p.index, 0);
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        return { slope, intercept };
    }

    calculateTolerance(data) {
        const prices = data.map(d => (d.high + d.low) / 2);
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        return avgPrice * 0.001; // 0.1% tolerance
    }

    clearAnalysisLines() {
        // Remove all price lines from each chart
        this.charts.forEach((chartObj) => {
            // Store the current lines to remove
            const linesToRemove = [...this.analysisLines];
            
            // Remove each line from the chart
            linesToRemove.forEach(line => {
                if (line.priceLine && chartObj.candlestickSeries) {
                    try {
                        chartObj.candlestickSeries.removePriceLine(line.priceLine);
                    } catch (e) {
                        console.warn('Error removing price line:', e);
                    }
                }
            });
        });
        
        // Clear the array after removing all lines
        this.analysisLines = [];
    }

    // Breakout Signal Detection Methods
    toggleBreakoutSignals() {
        const toggle = document.getElementById('breakoutSignalsToggle');
        const label = document.getElementById('breakoutSignalsLabel');
        
        if (this.supportResistanceEnabled) {
            // Enable breakout signals option when support/resistance is enabled
            toggle.disabled = false;
            label.style.opacity = '1';
            label.style.cursor = 'pointer';
            label.title = 'Detect when price breaks through support or resistance levels';
        } else {
            // Disable breakout signals option when support/resistance is disabled
            toggle.disabled = true;
            toggle.checked = false;
            this.breakoutSignalsEnabled = false;
            label.style.opacity = '0.5';
            label.style.cursor = 'not-allowed';
            label.title = 'Enable Support/Resistance first to use Breakout Signals';
            this.clearSignalArrows();
        }
    }

    detectBreakoutSignals() {
        this.clearSignalArrows();
        
        this.charts.forEach((chartObj, index) => {
            const instrument = this.selectedInstruments[index];
            if (!instrument || !this.currentData[instrument]) return;
            
            const data = this.currentData[instrument];
            const levels = this.getCurrentSRLevels(data);
            
            this.findBreakoutSignals(chartObj, data, levels, index);
        });
    }

    getCurrentSRLevels(data) {
        const levels = this.detectSupportResistance(data);
        return [...levels.support, ...levels.resistance];
    }

    findBreakoutSignals(chartObj, data, levels, chartIndex) {
        if (data.length < 20 || levels.length === 0) return;
        
        const signals = [];
        const lookbackPeriod = 10;
        
        for (let i = lookbackPeriod; i < data.length - 3; i++) {
            const currentBar = data[i];
            const previousBars = data.slice(i - lookbackPeriod, i);
            const followingBars = data.slice(i + 1, Math.min(i + 6, data.length));
            
            levels.forEach(level => {
                const breakout = this.detectBreakout(previousBars, currentBar, level.price);
                if (breakout) {
                    const pullbackSignal = this.detectPullbackSignal(
                        currentBar, followingBars, level.price, breakout.direction
                    );
                    
                    if (pullbackSignal) {
                        signals.push({
                            barIndex: i + pullbackSignal.confirmationBarIndex + 1,
                            direction: breakout.direction,
                            price: pullbackSignal.confirmationPrice,
                            level: level.price,
                            confidence: pullbackSignal.confidence
                        });
                    }
                }
            });
        }
        
        // Draw signal arrows
        signals.forEach(signal => {
            this.drawSignalArrow(chartObj, data[signal.barIndex], signal, chartIndex);
        });
    }

    detectBreakout(previousBars, currentBar, level) {
        const tolerance = level * 0.0005; // 0.05% tolerance
        
        // Check if previous bars were respecting the level
        const wasRespectingLevel = previousBars.slice(-5).every(bar => {
            return (bar.high < level + tolerance) || (bar.low > level - tolerance);
        });
        
        if (!wasRespectingLevel) return null;
        
        // Check for breakout
        if (currentBar.close > level + tolerance && currentBar.high > level + tolerance) {
            return { direction: 'up', breakoutBar: currentBar };
        } else if (currentBar.close < level - tolerance && currentBar.low < level - tolerance) {
            return { direction: 'down', breakoutBar: currentBar };
        }
        
        return null;
    }

    detectPullbackSignal(breakoutBar, followingBars, level, direction) {
        if (followingBars.length < 3) return null;
        
        const tolerance = level * 0.001; // 0.1% tolerance
        let pullbackFound = false;
        let hesitationFound = false;
        let confirmationBarIndex = -1;
        
        for (let i = 0; i < followingBars.length - 1; i++) {
            const bar = followingBars[i];
            const nextBar = followingBars[i + 1];
            
            // Look for pullback to the level
            if (!pullbackFound) {
                if (direction === 'up' && bar.low <= level + tolerance && bar.low >= level - tolerance) {
                    pullbackFound = true;
                } else if (direction === 'down' && bar.high >= level - tolerance && bar.high <= level + tolerance) {
                    pullbackFound = true;
                }
                continue;
            }
            
            // Look for hesitation and confirmation
            if (pullbackFound && !hesitationFound) {
                const hesitation = this.detectHesitation(bar, nextBar, level, direction);
                if (hesitation) {
                    hesitationFound = true;
                    confirmationBarIndex = i + 1;
                    
                    return {
                        confirmationBarIndex,
                        confirmationPrice: nextBar.close,
                        confidence: hesitation.confidence
                    };
                }
            }
        }
        
        return null;
    }

    detectHesitation(currentBar, nextBar, level, direction) {
        const bodySize = Math.abs(currentBar.close - currentBar.open);
        const totalRange = currentBar.high - currentBar.low;
        const bodyRatio = bodySize / totalRange;
        
        // Look for small body (indecision) near the level
        if (bodyRatio > 0.7) return null; // Too strong a move, not hesitation
        
        const tolerance = level * 0.001;
        const nearLevel = (currentBar.high >= level - tolerance && currentBar.low <= level + tolerance);
        
        if (!nearLevel) return null;
        
        // Check for continuation in the next bar
        if (direction === 'up') {
            if (nextBar.close > currentBar.high && nextBar.close > nextBar.open) {
                return { 
                    confidence: this.calculateConfidence(currentBar, nextBar, bodyRatio) 
                };
            }
        } else {
            if (nextBar.close < currentBar.low && nextBar.close < nextBar.open) {
                return { 
                    confidence: this.calculateConfidence(currentBar, nextBar, bodyRatio) 
                };
            }
        }
        
        return null;
    }

    calculateConfidence(hesitationBar, confirmationBar, bodyRatio) {
        let confidence = 0.5; // Base confidence
        
        // Lower body ratio = more hesitation = higher confidence
        confidence += (1 - bodyRatio) * 0.3;
        
        // Strong confirmation bar increases confidence
        const confirmationStrength = Math.abs(confirmationBar.close - confirmationBar.open) / 
                                    (confirmationBar.high - confirmationBar.low);
        confidence += confirmationStrength * 0.2;
        
        return Math.min(confidence, 1.0);
    }

    drawSignalArrow(chartObj, barData, signal, chartIndex) {
        // Create marker for the signal
        const markerPrice = signal.direction === 'up' ? 
            barData.low - (barData.high - barData.low) * 0.1 : 
            barData.high + (barData.high - barData.low) * 0.1;
        
        const marker = {
            time: new Date(barData.datetime).getTime() / 1000,
            position: signal.direction === 'up' ? 'belowBar' : 'aboveBar',
            color: signal.direction === 'up' ? '#00E676' : '#FF1744',
            shape: signal.direction === 'up' ? 'arrowUp' : 'arrowDown',
            text: signal.direction === 'up' ? 'BUY' : 'SELL',
            size: 2
        };
        
        try {
            // For Lightweight Charts v5, we need to use the markers API differently
            if (chartObj.candlestickSeries) {
                // Store current markers
                if (!chartObj.markers) chartObj.markers = [];
                chartObj.markers.push(marker);
                
                // Apply all markers to the series
                chartObj.candlestickSeries.applyOptions({
                    markers: chartObj.markers
                });
            }
        } catch (error) {
            console.warn('Error adding marker:', error);
        }
        
        // Store for cleanup
        this.signalArrows.push({
            chartIndex,
            marker,
            signal
        });
    }

    clearSignalArrows() {
        this.charts.forEach((chartObj, index) => {
            if (chartObj.markers) {
                try {
                    // Remove only signal arrows, keep other markers
                    const nonSignalMarkers = chartObj.markers.filter(marker => 
                        !this.signalArrows.some(arrow => arrow.marker === marker)
                    );
                    
                    // Update markers array
                    chartObj.markers = nonSignalMarkers;
                    
                    // Apply updated markers to the series
                    if (chartObj.candlestickSeries) {
                        chartObj.candlestickSeries.applyOptions({
                            markers: nonSignalMarkers
                        });
                    }
                } catch (error) {
                    console.warn('Error clearing markers:', error);
                    // Reset markers if there's an error
                    chartObj.markers = [];
                    if (chartObj.candlestickSeries) {
                        chartObj.candlestickSeries.applyOptions({
                            markers: []
                        });
                    }
                }
            }
        });
        
        this.signalArrows = [];
    }
    
    setupLogoRemoval() {
        // Use MutationObserver to detect and remove TradingView logo
        const observer = new MutationObserver((mutations) => {
            const chartContainer = document.getElementById('chart');
            if (!chartContainer) return;
            
            // Find and remove TradingView logo links
            const tvLinks = chartContainer.querySelectorAll('a[href*="tradingview.com"]');
            tvLinks.forEach(link => {
                if (link.parentNode) {
                    link.parentNode.removeChild(link);
                }
            });
        });
        
        // Start observing the chart container for DOM changes
        const chartContainer = document.getElementById('chart');
        if (chartContainer) {
            observer.observe(chartContainer, { 
                childList: true, 
                subtree: true 
            });
        }
    }

    // Drawing persistence methods
    async loadSavedDrawingsList() {
        try {
            const response = await fetch('/api/drawings');
            if (!response.ok) return;
            
            const data = await response.json();
            const select = document.getElementById('savedDrawingsSelect');
            if (!select) return;
            
            select.innerHTML = '<option value="">Load saved drawings...</option>';
            
            // Handle different response formats
            let drawingsList = [];
            
            if (Array.isArray(data)) {
                // If data is already an array
                drawingsList = data;
            } else if (data && typeof data === 'object') {
                // If data is an object with a drawings property
                if (Array.isArray(data.drawings)) {
                    drawingsList = data.drawings;
                } else {
                    // Try to extract any array property from the object
                    const arrayProps = Object.values(data).filter(val => Array.isArray(val));
                    if (arrayProps.length > 0) {
                        drawingsList = arrayProps[0];
                    }
                }
            }
            
            // Add options to select
            if (drawingsList.length > 0) {
                drawingsList.forEach(drawing => {
                    if (drawing && drawing.id) {
                        const option = document.createElement('option');
                        option.value = drawing.id;
                        option.textContent = `${drawing.name || 'Unnamed'} (${drawing.created_at || 'No date'})`;
                        select.appendChild(option);
                    }
                });
            } else {
                // Add a disabled option indicating no drawings
                const option = document.createElement('option');
                option.disabled = true;
                option.textContent = 'No saved drawings available';
                select.appendChild(option);
            }
        } catch (error) {
            console.error('Error loading saved drawings:', error);
        }
    }

    async saveDrawings() {
        if (this.drawingTools.length === 0) {
            alert('No drawings to save');
            return;
        }

        const name = prompt('Enter a name for this drawing set:');
        if (!name) return;

        try {
            const drawingData = {
                name: name.trim(),
                layout: this.layout,
                instruments: this.selectedInstruments.filter(Boolean),
                timeframe: document.getElementById('timeframeSelect')?.value || '1min',
                start_date: document.getElementById('startDateInput')?.value,
                end_date: document.getElementById('endDateInput')?.value,
                drawings: this.serializeDrawings()
            };

            const response = await fetch('/api/drawings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(drawingData)
            });

            if (response.ok) {
                alert('Drawings saved successfully!');
                await this.loadSavedDrawingsList();
            } else {
                throw new Error('Failed to save drawings');
            }
        } catch (error) {
            console.error('Error saving drawings:', error);
            alert('Failed to save drawings');
        }
    }

    async loadDrawings(drawingId) {
        try {
            const response = await fetch(`/api/drawings/${drawingId}`);
            if (!response.ok) throw new Error('Failed to load drawings');

            const savedData = await response.json();
            
            // Restore settings
            if (savedData.layout !== this.layout) {
                document.getElementById('layoutSelect').value = savedData.layout;
                this.layout = savedData.layout;
                this.toggleSecondInstrument();
                this.createChartLayout();
            }

            // Restore instruments
            if (savedData.instruments) {
                savedData.instruments.forEach((instrument, index) => {
                    const selectId = index === 0 ? 'instrumentSelect' : 'instrumentSelect2';
                    const select = document.getElementById(selectId);
                    if (select) select.value = instrument;
                    this.selectedInstruments[index] = instrument;
                });
            }

            // Restore timeframe and dates
            if (savedData.timeframe) {
                const timeframeSelect = document.getElementById('timeframeSelect');
                if (timeframeSelect) timeframeSelect.value = savedData.timeframe;
            }
            if (savedData.start_date) {
                const startDate = document.getElementById('startDateInput');
                if (startDate) startDate.value = savedData.start_date;
            }
            if (savedData.end_date) {
                const endDate = document.getElementById('endDateInput');
                if (endDate) endDate.value = savedData.end_date;
            }

            // Clear existing drawings
            this.clearAllDrawings();

            // Load data first
            await this.loadAllData();

            // Restore drawings
            setTimeout(() => {
                this.deserializeDrawings(savedData.drawings);
            }, 500); // Wait for charts to render

        } catch (error) {
            console.error('Error loading drawings:', error);
            alert('Failed to load drawings');
        }
    }

    async deleteDrawings() {
        const select = document.getElementById('savedDrawingsSelect');
        const drawingId = select?.value;
        
        if (!drawingId) {
            alert('Please select a drawing set to delete');
            return;
        }

        if (!confirm('Are you sure you want to delete this drawing set?')) {
            return;
        }

        try {
            const response = await fetch(`/api/drawings/${drawingId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                alert('Drawing set deleted successfully!');
                await this.loadSavedDrawingsList();
                select.value = '';
            } else {
                throw new Error('Failed to delete drawings');
            }
        } catch (error) {
            console.error('Error deleting drawings:', error);
            alert('Failed to delete drawings');
        }
    }

    serializeDrawings() {
        return this.drawingTools.map(drawing => ({
            type: drawing.type,
            points: drawing.points,
            chartIndex: this.charts.findIndex(chart => 
                chart.drawings.some(d => d.id === drawing.id)
            ),
            complete: drawing.complete,
            id: drawing.id
        }));
    }

    deserializeDrawings(serializedDrawings) {
        if (!serializedDrawings || !Array.isArray(serializedDrawings)) return;

        serializedDrawings.forEach(drawingData => {
            const drawing = {
                type: drawingData.type,
                points: drawingData.points,
                complete: drawingData.complete,
                id: drawingData.id || Date.now() + Math.random()
            };

            this.drawingTools.push(drawing);
            
            const chartIndex = drawingData.chartIndex || 0;
            if (this.charts[chartIndex]) {
                this.charts[chartIndex].drawings.push(drawing);
                this.renderDrawing(chartIndex, drawing);
            }
        });
    }

    // Clear cache for specific instrument or all instruments
    clearCache(instrument = null) {
        if (instrument) {
            // Clear cache for specific instrument
            Object.keys(this.dataCache).forEach(key => {
                if (key.startsWith(`${instrument}_`)) {
                    delete this.dataCache[key];
                }
            });
            console.log(`Cache cleared for instrument: ${instrument}`);
        } else {
            // Clear all cache
            this.dataCache = {};
            console.log('All cache cleared');
        }
    }
    
    // Check if we need to force reload based on parameter changes
    shouldForceReload(instrument) {
        if (!this.lastRequestParams[instrument]) return true;
        
        const currentParams = {
            timeframe: document.getElementById('timeframeSelect')?.value || '1min',
            startDate: document.getElementById('startDateInput')?.value,
            endDate: document.getElementById('endDateInput')?.value
        };
        
        const lastParams = this.lastRequestParams[instrument];
        
        // If any parameter changed, we should reload
        return currentParams.timeframe !== lastParams.timeframe ||
               currentParams.startDate !== lastParams.startDate ||
               currentParams.endDate !== lastParams.endDate;
    }
    
    // Show a global loading indicator for multiple charts
    showGlobalLoadingIndicator(show = true, message = 'Loading multiple charts...') {
        try {
            let indicator = document.getElementById('global-loading-indicator');
            
            if (show) {
                if (!indicator) {
                    indicator = document.createElement('div');
                    indicator.id = 'global-loading-indicator';
                    indicator.style.position = 'fixed';
                    indicator.style.top = '50px';
                    indicator.style.left = '50%';
                    indicator.style.transform = 'translateX(-50%)';
                    indicator.style.background = 'rgba(0,0,0,0.8)';
                    indicator.style.color = 'white';
                    indicator.style.padding = '10px 20px';
                    indicator.style.borderRadius = '4px';
                    indicator.style.zIndex = '2000';
                    indicator.style.fontWeight = 'bold';
                    
                    // Check if document.body exists before appending
                    if (document.body) {
                        document.body.appendChild(indicator);
                    } else {
                        console.error('Cannot append global loading indicator: document.body is not available');
                        return; // Exit early if we can't append
                    }
                }
                indicator.textContent = message;
                indicator.style.display = 'block';
                indicator.style.opacity = '1';
            } else if (indicator) {
                // Add a fade-out effect
                indicator.style.transition = 'opacity 0.5s';
                indicator.style.opacity = '0';
                setTimeout(() => {
                    if (indicator && indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 500);
            }
        } catch (error) {
            console.error('Error in showGlobalLoadingIndicator:', error);
        }
    }
    
    async loadAllData(forceReload = false) {
        // Use a unique timer name with timestamp to avoid conflicts
        const timerName = `loadAllData_${Date.now()}`;
        console.time(timerName);
        
        // Show global loading indicator if loading multiple charts
        if (this.layout === 2) {
            this.showGlobalLoadingIndicator(true, 'Loading multiple charts simultaneously...');
        }
        
        // Update main chart title based on layout
        const chartTitle = document.getElementById('chartTitle');
        if (chartTitle) {
            const timeframe = document.getElementById('timeframeSelect')?.value || '1min';
            
            if (this.layout === 1) {
                // Single chart - show instrument name
                const instrument = this.selectedInstruments[0];
                if (instrument) {
                    const instrumentName = this.getInstrumentDisplayName(instrument);
                    chartTitle.textContent = `${instrumentName} - ${timeframe.toUpperCase()}`;
                }
            } else {
                // Dual chart - show generic title
                chartTitle.textContent = `Trading Data View - ${timeframe.toUpperCase()} Timeframe`;
            }
        }
        
        // If force reload is requested, clear all cache
        if (forceReload) {
            this.clearCache();
        }
        
        // Prepare the list of charts to load
        const chartsToLoad = [];
        
        // Check if we're in dual chart mode
        if (this.layout === 2 && this.charts.length === 2) {
            const firstInstrument = this.selectedInstruments[0];
            const secondInstrument = this.selectedInstruments[1];
            
            // Check if we already have data for the first chart and if parameters haven't changed
            const hasFirstChartData = firstInstrument && 
                                     this.currentData[firstInstrument] && 
                                     this.currentData[firstInstrument].length > 0 &&
                                     !this.shouldForceReload(firstInstrument);
            
            // If we have data for the first chart and don't need to reload, only load the second chart
            if (hasFirstChartData && !forceReload) {
                console.log('First chart already has data, only loading second chart');
                
                // Make sure the first chart is properly rendered
                this.renderDataToChart(0, this.currentData[firstInstrument], firstInstrument);
                
                // Only add the second chart to the loading list
                if (secondInstrument) {
                    chartsToLoad.push({ chartIndex: 1, instrument: secondInstrument });
                }
            } else {
                // Add both charts to the loading list
                for (let i = 0; i < this.layout; i++) {
                    const instrument = this.selectedInstruments[i];
                    if (instrument) {
                        chartsToLoad.push({ chartIndex: i, instrument });
                    }
                }
            }
        } else {
            // Add all charts in the layout to the loading list
            for (let i = 0; i < this.layout; i++) {
                const instrument = this.selectedInstruments[i];
                if (instrument) {
                    chartsToLoad.push({ chartIndex: i, instrument });
                }
            }
        }

        try {
            // Load all charts simultaneously
            const promises = chartsToLoad.map(({ chartIndex, instrument }) => 
                this.loadDataForChart(chartIndex, instrument)
            );
            
            await Promise.all(promises);
            
            // Apply time synchronization if enabled and in dual chart mode
            if (this.layout === 2 && this.timeSync) {
                this.applySyncTimeSettings();
            }
            
            // Hide the global loading indicator
            this.showGlobalLoadingIndicator(false);
            
            // Show success message if multiple charts were loaded
            if (chartsToLoad.length > 1) {
                this.showMessage('All charts loaded successfully', 'success');
            }
            
            console.timeEnd(timerName);
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data');
            
            // Hide the global loading indicator
            this.showGlobalLoadingIndicator(false);
            
            console.timeEnd(timerName);
        }
    }

    async loadDataForChart(chartIndex, instrument) {
        const timeframe = document.getElementById('timeframeSelect')?.value || '1min';
        const startDate = document.getElementById('startDateInput')?.value;
        const endDate = document.getElementById('endDateInput')?.value;
        
        // Create a cache key based on the request parameters
        const cacheKey = `${instrument}_${timeframe}_${startDate || 'default'}_${endDate || 'default'}`;
        
        // Store current request parameters
        this.lastRequestParams[instrument] = { timeframe, startDate, endDate };
        
        // Check if we already have a pending request for this data
        if (this.pendingRequests[cacheKey]) {
            console.log(`Request for ${cacheKey} already in progress, waiting for it to complete...`);
            try {
                // Wait for the existing request to complete
                await this.pendingRequests[cacheKey];
                
                // If we have data for this instrument, render it
                if (this.currentData[instrument] && this.currentData[instrument].length > 0) {
                    this.renderDataToChart(chartIndex, this.currentData[instrument], instrument);
                }
                return;
            } catch (error) {
                console.error(`Error waiting for pending request: ${error}`);
                // Continue with a new request if the pending one failed
            }
        }
        
        // Check if we have cached data that's still valid
        const cachedData = this.dataCache[cacheKey];
        if (cachedData && (Date.now() - cachedData.timestamp < this.cacheTTL)) {
            console.log(`Using cached data for ${instrument} (${timeframe})`);
            this.currentData[instrument] = cachedData.data;
            this.renderDataToChart(chartIndex, cachedData.data, instrument);
            return;
        }
        
        // Create a promise for this request that we can track
        let requestPromise;
        
        try {
            // Show loading indicator
            this.showLoadingForChart(chartIndex);
            
            // First, load just the first 250 bars for quick display
            const initialParams = new URLSearchParams({ 
                timeframe,
                limit: '500',  // Increased from 250 to 500 for better initial view
                offset: '0'    // Start from the beginning
            });
            
            if (startDate) initialParams.append('start_date', startDate);
            if (endDate) initialParams.append('end_date', endDate);
            
            // Create the request promise
            requestPromise = (async () => {
                // First fetch - get the initial bars
                console.log(`Fetching initial data for ${instrument} with timeframe ${timeframe}`);
                const initialResponse = await fetch(`/api/data/${instrument}?${initialParams}`);
                
                if (!initialResponse.ok) {
                    const errorText = await initialResponse.text();
                    console.error(`API error (${initialResponse.status}): ${errorText}`);
                    throw new Error(`HTTP ${initialResponse.status}: ${errorText}`);
                }
                
                // Parse and validate the response
                let initialResult;
                try {
                    initialResult = await initialResponse.json();
                } catch (error) {
                    console.error(`Error parsing API response for ${instrument}:`, error);
                    throw new Error(`Invalid API response: ${error.message}`);
                }
                
                // Validate the response structure
                if (!initialResult || typeof initialResult !== 'object') {
                    console.error(`Invalid API response structure for ${instrument}:`, initialResult);
                    throw new Error('Invalid API response structure');
                }
                
                // Check if data array exists
                let initialData = [];
                if (Array.isArray(initialResult.data)) {
                    initialData = initialResult.data;
                    console.log(`Received ${initialData.length} data points for ${instrument}`);
                } else {
                    console.warn(`API returned no data array for ${instrument}`);
                }
                
                // Validate data points
                const validInitialData = initialData.filter(item => {
                    return item && 
                           item.datetime && 
                           item.open !== null && item.open !== undefined &&
                           item.high !== null && item.high !== undefined &&
                           item.low !== null && item.low !== undefined &&
                           item.close !== null && item.close !== undefined;
                });
                
                if (validInitialData.length < initialData.length) {
                    console.warn(`Filtered out ${initialData.length - validInitialData.length} invalid data points from API response`);
                    initialData = validInitialData;
                }
                
                // Sort data by datetime in ascending order (oldest first) for proper chart display
                // Since the API now returns data in descending order (newest first)
                if (initialData.length > 0) {
                    try {
                        initialData = initialData.sort((a, b) => {
                            return new Date(a.datetime) - new Date(b.datetime);
                        });
                    } catch (error) {
                        console.error(`Error sorting data for ${instrument}:`, error);
                        // Continue with unsorted data rather than failing
                    }
                }
                
                // Initialize the data array for this instrument
                this.currentData[instrument] = initialData;
                
                if (initialData.length === 0) {
                    this.showNoDataForChart(chartIndex);
                    return initialData;
                }
                
                // Render the initial data to show something quickly
                this.renderDataToChart(chartIndex, initialData, instrument);
                
                // Check if there's more data to load
                if (initialResult.pagination && initialResult.pagination.has_more) {
                    // Start progressive loading in the background
                    const fullData = await this.progressivelyLoadData(
                        chartIndex, instrument, timeframe, startDate, endDate, initialResult.pagination
                    );
                    
                    // Cache the complete data
                    this.dataCache[cacheKey] = {
                        data: fullData,
                        timestamp: Date.now()
                    };
                    
                    return fullData;
                }
                
                // If there's no more data, cache what we have
                this.dataCache[cacheKey] = {
                    data: initialData,
                    timestamp: Date.now()
                };
                
                return initialData;
            })();
            
            // Store the promise so we can track it
            this.pendingRequests[cacheKey] = requestPromise;
            
            // Wait for the request to complete
            await requestPromise;
            
        } catch (error) {
            console.error(`Error loading data for ${instrument}:`, error);
            this.showErrorForChart(chartIndex, `Failed to load data for ${instrument}`);
        } finally {
            // Clean up the pending request
            if (this.pendingRequests[cacheKey] === requestPromise) {
                delete this.pendingRequests[cacheKey];
            }
        }
    }
    
    async progressivelyLoadData(chartIndex, instrument, timeframe, startDate, endDate, pagination) {
        // Track the current offset
        let currentOffset = pagination.offset + pagination.limit;
        const totalCount = pagination.total;
        let hasMore = pagination.has_more;
        
        // Create a status indicator for progressive loading
        const chartContainer = document.getElementById(`chart${chartIndex + 1}`);
        if (!chartContainer) {
            console.error(`Chart container #chart${chartIndex + 1} not found`);
            return this.currentData[instrument] || [];
        }
        
        // Create or update progress indicator
        let progressIndicator = chartContainer.querySelector('.progress-indicator');
        if (!progressIndicator) {
            progressIndicator = document.createElement('div');
            progressIndicator.className = 'progress-indicator';
            progressIndicator.style.position = 'absolute';
            progressIndicator.style.bottom = '10px';
            progressIndicator.style.right = '10px';
            progressIndicator.style.background = 'rgba(0,0,0,0.7)';
            progressIndicator.style.color = 'white';
            progressIndicator.style.padding = '5px 10px';
            progressIndicator.style.borderRadius = '3px';
            progressIndicator.style.fontSize = '12px';
            progressIndicator.style.zIndex = '1000';
            
            // Check if chartContainer exists and is a valid DOM element before appending
            if (chartContainer && chartContainer.appendChild) {
                chartContainer.appendChild(progressIndicator);
            } else {
                console.error('Cannot append progress indicator: chart container is not a valid DOM element');
                // Create a fallback indicator that doesn't need to be appended to the DOM
                this.showMessage(`Loading data for ${instrument}...`, 'info');
            }
        }
        
        if (progressIndicator) {
            progressIndicator.textContent = `Loading data: ${Math.min(currentOffset, totalCount)}/${totalCount}`;
        }
        
        // Store the initial data to keep track of what we've already loaded
        const initialData = [...this.currentData[instrument]];
        let allNewData = [];
        
        // Calculate optimal chunk size based on total data size
        // For larger datasets, use larger chunks to reduce number of requests
        let chunkSize = 1000; // Default chunk size
        if (totalCount > 10000) {
            chunkSize = 2500;
        } else if (totalCount > 50000) {
            chunkSize = 5000;
        }
        
        // Calculate number of parallel requests based on data size and number of charts
        // Reduce parallel requests per chart when loading multiple charts
        let maxParallelRequests = 1; // Default to sequential loading
        
        // Check how many charts are currently loading
        const activeCharts = Object.keys(this.pendingRequests).length;
        
        // Adjust parallel requests based on data size and active charts
        if (totalCount > 5000 && totalCount <= 20000) {
            maxParallelRequests = activeCharts > 1 ? 1 : 2; // Reduce if multiple charts
        } else if (totalCount > 20000) {
            maxParallelRequests = activeCharts > 1 ? 2 : 3; // Reduce if multiple charts
        }
        
        // Continue loading data in chunks until we have everything
        while (hasMore) {
            try {
                // Create batch of requests to run in parallel
                const batchPromises = [];
                let batchOffsets = [];
                
                for (let i = 0; i < maxParallelRequests && hasMore; i++) {
                    const currentBatchOffset = currentOffset + (i * chunkSize);
                    
                    // Don't exceed total count
                    if (currentBatchOffset >= totalCount) {
                        break;
                    }
                    
                    // Prepare parameters for this chunk
                    const params = new URLSearchParams({ 
                        timeframe,
                        limit: chunkSize.toString(),
                        offset: currentBatchOffset.toString()
                    });
                    
                    if (startDate) params.append('start_date', startDate);
                    if (endDate) params.append('end_date', endDate);
                    
                    // Add to batch with proper error handling
                    const batchPromise = fetch(`/api/data/${instrument}?${params}`)
                        .then(async res => {
                            if (!res.ok) {
                                const errorText = await res.text();
                                throw new Error(`HTTP ${res.status}: ${errorText}`);
                            }
                            return res.json();
                        })
                        .then(data => {
                            // Validate response structure
                            if (!data || typeof data !== 'object' || !Array.isArray(data.data)) {
                                console.warn(`Invalid batch response structure for offset ${currentBatchOffset}`);
                                return { data: [], pagination: { has_more: false } };
                            }
                            return data;
                        })
                        .catch(error => {
                            console.error(`Batch request failed for offset ${currentBatchOffset}:`, error);
                            // Return empty data instead of failing the whole batch
                            return { data: [], pagination: { has_more: false } };
                        });
                    
                    batchPromises.push(batchPromise);
                    batchOffsets.push(currentBatchOffset);
                }
                
                if (batchPromises.length === 0) {
                    break; // No more requests to make
                }
                
                // Execute batch of requests in parallel
                const results = await Promise.all(batchPromises);
                
                // Process results
                let batchNewData = [];
                let lastResult = null;
                
                for (let i = 0; i < results.length; i++) {
                    const result = results[i];
                    const newData = result.data || [];
                    batchNewData = [...batchNewData, ...newData];
                    
                    // Keep track of the last result for pagination info
                    if (i === results.length - 1) {
                        lastResult = result;
                        hasMore = result.pagination.has_more;
                    }
                }
                
                // Update offset to after the last batch
                currentOffset = batchOffsets[batchOffsets.length - 1] + chunkSize;
                
                // Update progress indicator
                const loadedCount = Math.min(initialData.length + allNewData.length + batchNewData.length, totalCount);
                const percentComplete = Math.round((loadedCount / totalCount) * 100);
                if (progressIndicator) {
                    progressIndicator.textContent = `Loading: ${percentComplete}% (${loadedCount}/${totalCount})`;
                }
                
                // Update global loading indicator if multiple charts are loading
                if (this.layout === 2) {
                    const instrumentName = this.getInstrumentDisplayName(instrument);
                    this.showGlobalLoadingIndicator(true, 
                        `Loading ${instrumentName}: ${percentComplete}% complete`);
                }
                
                // Add the new batch data to our collection
                allNewData = [...allNewData, ...batchNewData];
                
                // Update the progress indicator but don't update the chart during loading
                // This prevents "Value is null" errors during progressive loading
                if (allNewData.length > 0) {
                    // Just update the current data without rendering to chart
                    const combinedData = [...initialData, ...allNewData];
                    this.currentData[instrument] = combinedData;
                    
                    // Only update the progress indicator
                    const percentComplete = Math.round((loadedCount / totalCount) * 100);
                    if (progressIndicator) {
                        progressIndicator.textContent = `Loading: ${percentComplete}% (${loadedCount}/${totalCount})`;
                        progressIndicator.style.background = 'rgba(0,0,255,0.7)';
                    }
                    
                    // Log progress but don't update chart
                    console.log(`Progressive loading: ${percentComplete}% complete for ${instrument}`);
                }
                
                // Small delay to allow UI to update and prevent browser from freezing
                await new Promise(resolve => setTimeout(resolve, 10));
                
            } catch (error) {
                console.error(`Error during progressive loading for ${instrument}:`, error);
                
                if (progressIndicator) {
                    progressIndicator.textContent = `Error loading data. Loaded ${initialData.length + allNewData.length} of ${totalCount} points.`;
                    progressIndicator.style.background = 'rgba(255,0,0,0.7)';
                }
                
                // Show error message to user
                this.showMessage(`Error loading data for ${instrument}. Retrying...`, 'error');
                
                // Add retry logic
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Try up to 3 times before giving up
                const retryCount = (this.retryCount || 0) + 1;
                this.retryCount = retryCount;
                
                if (retryCount <= 3) {
                    if (progressIndicator) {
                        progressIndicator.textContent = `Retrying... (${retryCount}/3)`;
                        progressIndicator.style.background = 'rgba(255,165,0,0.7)'; // Orange for retry
                    }
                    continue; // Try again
                } else {
                    hasMore = false; // Give up after 3 retries
                    this.retryCount = 0;
                    this.showMessage(`Failed to load all data for ${instrument} after 3 attempts.`, 'error');
                }
            }
        }
        
        // All data loaded, now update the chart with all data at once
        if (allNewData.length > 0) {
            try {
                console.log(`All data loaded for ${instrument}, preparing final render...`);
                
                // Combine all data
                const combinedData = [...initialData, ...allNewData];
                
                // Filter out any invalid data points before final processing
                const validCombinedData = combinedData.filter(item => {
                    return item && 
                           item.datetime && 
                           item.open !== null && item.open !== undefined &&
                           item.high !== null && item.high !== undefined &&
                           item.low !== null && item.low !== undefined &&
                           item.close !== null && item.close !== undefined;
                });
                
                if (validCombinedData.length < combinedData.length) {
                    console.warn(`Filtered out ${combinedData.length - validCombinedData.length} invalid data points before final render`);
                }
                
                // Sort data by datetime in ascending order (oldest first) for proper chart display
                // Since the API now returns data in descending order (newest first)
                let fullData;
                try {
                    fullData = validCombinedData.sort((a, b) => {
                        return new Date(a.datetime) - new Date(b.datetime);
                    });
                } catch (error) {
                    console.error(`Error sorting data for ${instrument}:`, error);
                    fullData = validCombinedData; // Use unsorted data rather than failing
                }
                
                // Store the processed data
                this.currentData[instrument] = fullData;
                
                // Update the progress indicator to show completion
                if (progressIndicator) {
                    progressIndicator.textContent = `Processing ${fullData.length} data points...`;
                    progressIndicator.style.background = 'rgba(255,165,0,0.7)'; // Orange for processing
                }
                
                // Small delay before rendering to allow UI to update
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Update the chart with the complete dataset
                console.log(`Rendering final dataset with ${fullData.length} points for ${instrument}`);
                this.renderDataToChart(chartIndex, fullData, instrument);
                
                // Update the indicator to show success
                if (progressIndicator) {
                    progressIndicator.textContent = `Loaded ${fullData.length} data points`;
                    progressIndicator.style.background = 'rgba(0,128,0,0.7)'; // Green for success
                    
                    setTimeout(() => {
                        if (progressIndicator && progressIndicator.parentNode) {
                            progressIndicator.parentNode.removeChild(progressIndicator);
                        }
                    }, 3000);
                }
                
                console.log(`Completed loading all ${fullData.length} data points for ${instrument}`);
                return fullData;
            } catch (error) {
                console.error(`Error in final data processing for ${instrument}:`, error);
                
                // Show error in progress indicator
                if (progressIndicator) {
                    progressIndicator.textContent = `Error processing data: ${error.message}`;
                    progressIndicator.style.background = 'rgba(255,0,0,0.7)'; // Red for error
                    
                    setTimeout(() => {
                        if (progressIndicator && progressIndicator.parentNode) {
                            progressIndicator.parentNode.removeChild(progressIndicator);
                        }
                    }, 5000);
                }
                
                // Return whatever data we have
                return this.currentData[instrument] || [];
            }
        }
        
        // Clean up the progress indicator if it exists
        if (progressIndicator) {
            setTimeout(() => {
                if (progressIndicator && progressIndicator.parentNode) {
                    progressIndicator.parentNode.removeChild(progressIndicator);
                }
            }, 3000);
        }
        
        return this.currentData[instrument] || [];
    }
    
    
    showLoadingForChart(chartIndex) {
        const chartDiv = document.getElementById(`chart${chartIndex + 1}`);
        if (!chartDiv) return;
        
        // Check if there's already a loading indicator
        let loadingDiv = chartDiv.querySelector('.chart-loading');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.className = 'chart-loading';
            loadingDiv.textContent = 'Loading data...';
            loadingDiv.style.position = 'absolute';
            loadingDiv.style.top = '50%';
            loadingDiv.style.left = '50%';
            loadingDiv.style.transform = 'translate(-50%, -50%)';
            loadingDiv.style.background = 'rgba(255, 255, 255, 0.8)';
            loadingDiv.style.padding = '10px 20px';
            loadingDiv.style.borderRadius = '4px';
            loadingDiv.style.zIndex = '1000';
            
            chartDiv.style.position = 'relative';
            chartDiv.appendChild(loadingDiv);
        }
    }
    
    resetChartView(chartIndex) {
        if (chartIndex < 0 || chartIndex >= this.charts.length) return;
        
        const chartObj = this.charts[chartIndex];
        if (!chartObj || !chartObj.chart) return;
        
        const chart = chartObj.chart;
        
        // Reset to fit all data
        chart.timeScale().fitContent();
        
        // If we have candlestick series, ensure price scale is also reset
        if (chartObj.candlestickSeries) {
            chart.priceScale('right').applyOptions({
                autoScale: true,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.2,
                },
            });
        }
        
        // Hide the reset button after resetting
        const resetButton = document.getElementById(`resetZoom${chartIndex + 1}`);
        if (resetButton) {
            resetButton.style.display = 'none';
        }
    }

    renderDataToChart(chartIndex, data, instrument) {
        try {
            console.log(`Rendering data for chart ${chartIndex + 1}, instrument: ${instrument}, data points: ${data ? data.length : 0}`);
            
            // First check if we have a valid chart object
            const chartObj = this.charts[chartIndex];
            if (!chartObj) {
                console.error(`Chart object not found for index ${chartIndex}`);
                return;
            }
            
            // Check if data is valid
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.warn(`No data or empty array for chart ${chartIndex + 1}`);
                this.showErrorForChart(chartIndex, `No data available for ${instrument}`);
                return;
            }
            
            // Debug: Log a sample of the data to inspect structure
            console.log(`Data sample for ${instrument}:`, data.slice(0, 2));
            
            // Filter out any invalid data points with detailed logging
            const validData = data.filter((item, index) => {
                // Check if item exists
                if (!item) {
                    console.warn(`Null/undefined data point at index ${index}`);
                    return false;
                }
                
                // Check datetime
                if (!item.datetime) {
                    console.warn(`Missing datetime at index ${index}`);
                    return false;
                }
                
                // Check OHLC values
                const hasValidOHLC = 
                    item.open !== null && item.open !== undefined && !isNaN(Number(item.open)) &&
                    item.high !== null && item.high !== undefined && !isNaN(Number(item.high)) &&
                    item.low !== null && item.low !== undefined && !isNaN(Number(item.low)) &&
                    item.close !== null && item.close !== undefined && !isNaN(Number(item.close));
                
                if (!hasValidOHLC) {
                    console.warn(`Invalid OHLC values at index ${index}:`, {
                        open: item.open,
                        high: item.high,
                        low: item.low,
                        close: item.close
                    });
                    return false;
                }
                
                return true;
            });
            
            if (validData.length === 0) {
                console.warn(`No valid data points for chart ${chartIndex + 1}`);
                this.showErrorForChart(chartIndex, `No valid data available for ${instrument}`);
                return;
            }
            
            // Log if we filtered out any data points
            if (validData.length < data.length) {
                console.warn(`Filtered out ${data.length - validData.length} invalid data points for chart ${chartIndex + 1}`);
            }
            
            // Prepare candlestick data with additional validation
            const candlestickData = validData.map(item => {
                // Ensure time is valid
                let time;
                try {
                    time = new Date(item.datetime).getTime() / 1000;
                    if (isNaN(time)) {
                        console.warn(`Invalid datetime: ${item.datetime}`);
                        time = 0; // Fallback
                    }
                } catch (e) {
                    console.error(`Error parsing datetime: ${item.datetime}`, e);
                    time = 0; // Fallback
                }
                
                return {
                    time,
                    open: Number(item.open),
                    high: Number(item.high),
                    low: Number(item.low),
                    close: Number(item.close)
                };
            });
            
            // Prepare volume data with additional validation
            const volumeData = validData.map(item => {
                // Ensure time is valid
                let time;
                try {
                    time = new Date(item.datetime).getTime() / 1000;
                    if (isNaN(time)) {
                        time = 0; // Fallback
                    }
                } catch (e) {
                    time = 0; // Fallback
                }
                
                // Ensure volume is a valid number
                let volume = 0;
                if (item.volume !== null && item.volume !== undefined) {
                    volume = Number(item.volume);
                    if (isNaN(volume)) volume = 0;
                }
                
                return {
                    time,
                    value: volume,
                    color: item.close >= item.open ? '#26a69a80' : '#ef535080'
                };
            });

            // Debug: Log the prepared data
            console.log(`Prepared ${candlestickData.length} candlestick data points for chart ${chartIndex + 1}`);
            
            try {
                // Check if chart series exist
                if (!chartObj.candlestickSeries) {
                    console.error(`Candlestick series not found for chart ${chartIndex + 1}`);
                    this.showErrorForChart(chartIndex, `Chart initialization error`);
                    return;
                }
                
                if (!chartObj.volumeSeries) {
                    console.error(`Volume series not found for chart ${chartIndex + 1}`);
                    // Continue with just candlestick data
                }
                
                // Set data with error handling
                try {
                    chartObj.candlestickSeries.setData(candlestickData);
                } catch (error) {
                    console.error(`Error setting candlestick data for chart ${chartIndex + 1}:`, error);
                    this.showMessage(`Error rendering price data for ${instrument}`, 'error');
                    // Try with a smaller dataset as fallback
                    if (candlestickData.length > 100) {
                        console.log(`Trying with reduced dataset (100 points) for chart ${chartIndex + 1}`);
                        try {
                            chartObj.candlestickSeries.setData(candlestickData.slice(-100));
                        } catch (fallbackError) {
                            console.error(`Fallback also failed:`, fallbackError);
                        }
                    }
                }
                
                try {
                    if (chartObj.volumeSeries) {
                        chartObj.volumeSeries.setData(volumeData);
                    }
                } catch (error) {
                    console.error(`Error setting volume data for chart ${chartIndex + 1}:`, error);
                    // Volume data is secondary, so we can continue without it
                }
                
                // Update chart title
                this.updateChartTitle(chartIndex, instrument);
                
                // Remove loading indicator
                this.removeLoadingIndicator(chartIndex);
                
                // Apply technical analysis if enabled
                setTimeout(() => {
                    try {
                        this.updateTechnicalAnalysis();
                    } catch (error) {
                        console.error(`Error updating technical analysis:`, error);
                    }
                }, 100);
                
                console.log(`Successfully rendered data for chart ${chartIndex + 1}`);
            } catch (error) {
                console.error(`Unexpected error rendering chart ${chartIndex + 1}:`, error);
                this.showErrorForChart(chartIndex, `Failed to render chart: ${error.message}`);
            }
        } catch (error) {
            console.error(`Outer error in renderDataToChart:`, error);
            this.showMessage(`Failed to process data for chart: ${error.message}`, 'error');
        }
    }
    
    removeLoadingIndicator(chartIndex) {
        const chartDiv = document.getElementById(`chart${chartIndex + 1}`);
        if (!chartDiv) return;
        
        const loadingDiv = chartDiv.querySelector('.chart-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }
    
    showErrorForChart(chartIndex, message) {
        const chartDiv = document.getElementById(`chart${chartIndex + 1}`);
        if (!chartDiv) return;
        
        // Remove loading indicator if present
        this.removeLoadingIndicator(chartIndex);
        
        // Check if there's already an error message
        let errorDiv = chartDiv.querySelector('.chart-error-message');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'chart-error-message';
            errorDiv.style.position = 'absolute';
            errorDiv.style.top = '50%';
            errorDiv.style.left = '50%';
            errorDiv.style.transform = 'translate(-50%, -50%)';
            errorDiv.style.background = 'rgba(255, 100, 100, 0.9)';
            errorDiv.style.color = 'white';
            errorDiv.style.padding = '10px 20px';
            errorDiv.style.borderRadius = '4px';
            errorDiv.style.zIndex = '1000';
            errorDiv.style.textAlign = 'center';
            
            chartDiv.style.position = 'relative';
            chartDiv.appendChild(errorDiv);
        }
        
        errorDiv.textContent = message;
    }
    
    showNoDataForChart(chartIndex) {
        this.showErrorForChart(chartIndex, 'No data available for the selected period');
    }

    updateChartTitle(chartIndex, instrument) {
        const instrumentName = this.getInstrumentDisplayName(instrument);
        const timeframe = document.getElementById('timeframeSelect')?.value || '1min';
        
        // Add title above chart
        const chartDiv = document.getElementById(`chart${chartIndex + 1}`);
        if (chartDiv) {
            let titleDiv = chartDiv.querySelector('.chart-title-overlay');
            if (!titleDiv) {
                titleDiv = document.createElement('div');
                titleDiv.className = 'chart-title-overlay';
                titleDiv.style.cssText = `
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background: rgba(255, 255, 255, 0.9);
                    padding: 5px 10px;
                    border-radius: 4px;
                    font-weight: bold;
                    z-index: 10;
                `;
                chartDiv.style.position = 'relative';
                chartDiv.appendChild(titleDiv);
            }
            titleDiv.textContent = `${instrumentName} - ${timeframe.toUpperCase()}`;
        }
    }

    // Render data table
    renderTable() {
        const tableContent = document.getElementById('tableContent');
        if (!tableContent || !this.currentData) return;

        // Get data from first selected instrument
        const firstInstrument = this.selectedInstruments[0];
        if (!firstInstrument || !this.currentData[firstInstrument]) return;

        const data = this.currentData[firstInstrument];
        if (!data.length) return;

        const instrumentName = this.getInstrumentDisplayName(firstInstrument);

        const html = `
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th>DateTime</th>
                            <th>Open</th>
                            <th>High</th>
                            <th>Low</th>
                            <th>Close</th>
                            <th>Volume</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => {
                            const change = row.close - row.open;
                            const changeClass = change > 0 ? 'positive' : change < 0 ? 'negative' : '';
                            
                            return `
                                <tr class="${changeClass}">
                                    <td>${this.formatDateTime(row.datetime)}</td>
                                    <td>${this.formatPrice(row.open)}</td>
                                    <td>${this.formatPrice(row.high)}</td>
                                    <td>${this.formatPrice(row.low)}</td>
                                    <td>${this.formatPrice(row.close)}</td>
                                    <td>${row.volume.toLocaleString()}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            <div class="table-footer">
                <div class="table-info">
                    Showing ${data.length.toLocaleString()} records for <strong>${instrumentName}</strong>
                </div>
                <div class="table-actions">
                    <button class="btn-small download-btn" onclick="viewer.openDownloadModal()">Export</button>
                    <button class="btn-small" onclick="viewer.loadAllData()">Refresh</button>
                </div>
            </div>
        `;

        tableContent.innerHTML = html;
    }

    // Utility methods
    getInstrumentDisplayName(tableName) {
        const instrument = this.instruments.find(i => i.table_name === tableName);
        return instrument ? instrument.display_name : tableName;
    }

    formatDateTime(dateStr) {
        return new Date(dateStr).toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    formatPrice(price) {
        return parseFloat(price).toFixed(4);
    }

    showNoDataForChart(chartIndex) {
        const chartDiv = document.getElementById(`chart${chartIndex + 1}`);
        if (chartDiv) {
            chartDiv.innerHTML = '<div class="no-data"><h3>No Data</h3><p>No data found for selected parameters.</p></div>';
        }
    }
    
    showMessage(message, type = 'error') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.textContent = message;
        messageDiv.style.position = 'fixed';
        messageDiv.style.top = '20px';
        messageDiv.style.left = '50%';
        messageDiv.style.transform = 'translateX(-50%)';
        messageDiv.style.color = 'white';
        messageDiv.style.padding = '10px 20px';
        messageDiv.style.borderRadius = '4px';
        messageDiv.style.zIndex = '2000';
        messageDiv.style.transition = 'opacity 0.5s';
        
        // Set background color based on message type
        switch (type) {
            case 'error':
                messageDiv.style.background = 'rgba(255, 0, 0, 0.8)';
                break;
            case 'success':
                messageDiv.style.background = 'rgba(0, 128, 0, 0.8)';
                break;
            case 'info':
                messageDiv.style.background = 'rgba(0, 0, 255, 0.8)';
                break;
            case 'warning':
                messageDiv.style.background = 'rgba(255, 165, 0, 0.8)';
                break;
            default:
                messageDiv.style.background = 'rgba(0, 0, 0, 0.8)';
        }
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.style.opacity = '0';
            setTimeout(() => {
                if (messageDiv.parentNode) {
                    messageDiv.parentNode.removeChild(messageDiv);
                }
            }, 500);
        }, 3000);
    }
    
    showError(message, isRetryable = true) {
        console.error(message);
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) return;
        
        chartContainer.innerHTML = `
            <div class="chart-error" style="text-align: center; padding: 20px; color: red; border: 1px solid #ddd; margin: 20px auto; max-width: 80%;">
                <h3>Error</h3>
                <p>${message}</p>
                ${isRetryable ? `
                <button onclick="location.reload()" style="padding: 10px; margin-top: 10px; cursor: pointer; background-color: #4CAF50; color: white; border: none; border-radius: 4px;">
                    Refresh Page
                </button>
                ` : ''}
            </div>
        `;
        
        // Also update the chart title
        const chartTitle = document.getElementById('chartTitle');
        if (chartTitle) {
            chartTitle.textContent = 'Error Loading Chart';
            chartTitle.style.color = 'red';
        }
    }

    showError(message) {
        console.error(message);
        document.getElementById('chart').innerHTML = `
            <div class="no-data">
                <h3>Error</h3>
                <p>${message}</p>
                <button onclick="location.reload()">Refresh Page</button>
            </div>
        `;
    }

    openDownloadModal() {
        try {
            console.log('Opening download modal...');
            
            // Check if we have data to download
            if (this.selectedInstruments.filter(Boolean).length === 0) {
                this.showError('Please load data first');
                return;
            }
            
            // Validate that we have actual data for the selected instrument
            const instrumentName = this.selectedInstruments[0];
            if (!instrumentName || !this.currentData[instrumentName] || !Array.isArray(this.currentData[instrumentName]) || this.currentData[instrumentName].length === 0) {
                this.showError('No valid data available to download');
                return;
            }
            
            // Show the modal
            const downloadModal = document.getElementById('downloadModal');
            if (!downloadModal) {
                console.error('Download modal element not found');
                this.showError('Download functionality is not available');
                return;
            }
            
            downloadModal.style.display = 'block';
            
            // Set up format option selection if not already done
            if (!this.downloadModalInitialized) {
                console.log('Initializing download modal...');
                
                // Add click handlers for format options
                const formatOptions = document.querySelectorAll('.format-option');
                formatOptions.forEach(option => {
                    option.addEventListener('click', () => {
                        // Remove selected class from all options
                        formatOptions.forEach(opt => opt.classList.remove('selected'));
                        // Add selected class to clicked option
                        option.classList.add('selected');
                    });
                });
                
                // Add click handler for confirm download button
                const confirmButton = document.getElementById('confirmDownload');
                if (confirmButton) {
                    confirmButton.addEventListener('click', () => {
                        const selectedOption = document.querySelector('.format-option.selected');
                        if (!selectedOption) {
                            this.showError('Please select a format');
                            return;
                        }
                        
                        const selectedFormat = selectedOption.getAttribute('data-format');
                        if (!selectedFormat) {
                            this.showError('Invalid format selection');
                            return;
                        }
                        
                        // Prevent chart updates during download
                        const isLoadingBackup = this.isLoadingData;
                        this.isLoadingData = true;
                        
                        try {
                            this.downloadData(selectedFormat);
                        } finally {
                            // Restore loading state
                            this.isLoadingData = isLoadingBackup;
                        }
                        
                        this.closeDownloadModal();
                    });
                } else {
                    console.error('Confirm download button not found');
                }
                
                this.downloadModalInitialized = true;
                console.log('Download modal initialized');
            }
        } catch (error) {
            console.error('Error opening download modal:', error);
            this.showError('Failed to open download dialog');
        }
    }

    closeDownloadModal() {
        try {
            const downloadModal = document.getElementById('downloadModal');
            if (downloadModal) {
                downloadModal.style.display = 'none';
            }
        } catch (error) {
            console.error('Error closing download modal:', error);
        }
    }
    
    downloadData(format) {
        try {
            console.log('Starting data download process...');
            
            // Get the currently selected instrument
            const instrumentName = this.selectedInstruments[0];
            if (!instrumentName || !this.currentData[instrumentName]) {
                this.showError('No data available to download');
                return;
            }
            
            // Get the data and validate it
            let rawData = this.currentData[instrumentName];
            if (!Array.isArray(rawData) || rawData.length === 0) {
                this.showError('No valid data available to download');
                return;
            }
            
            console.log(`Preparing to download ${rawData.length} records for ${instrumentName}`);
            
            // Filter out any invalid data points
            const data = rawData.filter(item => {
                return item && typeof item === 'object';
            });
            
            if (data.length === 0) {
                this.showError('No valid data records to download');
                return;
            }
            
            if (data.length < rawData.length) {
                console.warn(`Filtered out ${rawData.length - data.length} invalid records for download`);
            }
            
            let content, filename, mimeType;
            
            // Format the data according to the selected format
            if (format === 'csv') {
                try {
                    // Ensure we have at least one valid record with properties
                    if (!data[0] || typeof data[0] !== 'object') {
                        this.showError('Invalid data structure for CSV export');
                        return;
                    }
                    
                    // Get headers safely
                    const headers = Object.keys(data[0]).join(',');
                    
                    // Process rows with error handling
                    const rows = data.map(row => {
                        if (!row || typeof row !== 'object') return '';
                        
                        // Convert values to strings and handle nulls/undefined
                        return Object.values(row).map(val => {
                            if (val === null || val === undefined) return '';
                            if (typeof val === 'string' && val.includes(',')) {
                                // Escape strings with commas
                                return `"${val.replace(/"/g, '""')}"`;
                            }
                            return String(val);
                        }).join(',');
                    }).filter(row => row !== '').join('\\n');
                    
                    content = headers + '\\n' + rows;
                    filename = `${instrumentName}_data.csv`;
                    mimeType = 'text/csv';
                } catch (error) {
                    console.error('Error creating CSV content:', error);
                    this.showError('Failed to create CSV file');
                    return;
                }
            } else if (format === 'json') {
                try {
                    // Create JSON content with a try-catch to handle circular references
                    content = JSON.stringify(data, (key, value) => {
                        // Handle special cases like Date objects
                        if (value instanceof Date) {
                            return value.toISOString();
                        }
                        return value;
                    }, 2);
                    
                    filename = `${instrumentName}_data.json`;
                    mimeType = 'application/json';
                } catch (error) {
                    console.error('Error creating JSON content:', error);
                    this.showError('Failed to create JSON file');
                    return;
                }
            } else {
                this.showError('Invalid format selected');
                return;
            }
            
            console.log(`Download prepared: ${filename} (${format})`);
            
            // Create a download link and trigger it
            try {
                const blob = new Blob([content], { type: mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                
                // Safely append and remove from document
                if (document.body) {
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else {
                    // Fallback if document.body is not available
                    a.click();
                }
                
                URL.revokeObjectURL(url);
                console.log('Download initiated successfully');
                
                // Show success message
                this.showMessage(`${format.toUpperCase()} file download started`, 'success');
            } catch (error) {
                console.error('Error triggering download:', error);
                this.showError('Failed to download file');
            }
        } catch (error) {
            console.error('Unexpected error in downloadData:', error);
            this.showError('An unexpected error occurred during download');
        }
    }
}

// Global functions for HTML onclick handlers
function closeDownloadModal() {
    try {
        if (window.viewer) {
            window.viewer.closeDownloadModal();
        } else {
            const downloadModal = document.getElementById('downloadModal');
            if (downloadModal) {
                downloadModal.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error in global closeDownloadModal:', error);
        // Try direct DOM manipulation as fallback
        try {
            const downloadModal = document.getElementById('downloadModal');
            if (downloadModal) {
                downloadModal.style.display = 'none';
            }
        } catch (e) {
            // Last resort - silent fail
        }
    }
}

// Debug function to check LightweightCharts library
function debugLightweightCharts() {
    console.log('Debugging LightweightCharts library:');
    if (typeof window.LightweightCharts === 'undefined') {
        console.error('LightweightCharts is not defined');
        return false;
    }
    
    console.log('LightweightCharts version:', window.LightweightCharts.version ? window.LightweightCharts.version() : 'unknown');
    console.log('Available methods:', Object.keys(window.LightweightCharts));
    
    // Check if createChart exists
    if (typeof window.LightweightCharts.createChart !== 'function') {
        console.error('createChart method is not available');
        return false;
    }
    
    console.log('LightweightCharts library looks valid');
    return true;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        // Set default dates before initializing the viewer
        setDefaultDates();
        
        // Debug the chart library
        const libraryValid = debugLightweightCharts();
        if (!libraryValid) {
            throw new Error('Chart library not properly loaded');
        }
        
        // Initialize the viewer
        window.viewer = new AdvancedTradingViewer();
        console.log('Trading Data Viewer initialized successfully');
    } catch (error) {
        console.error('Error initializing Trading Data Viewer:', error);
        
        // Show error message on the page
        const chartContainer = document.getElementById('chart');
        if (chartContainer) {
            chartContainer.innerHTML = `
                <div class="chart-error">
                    <h3>Initialization Error</h3>
                    <p>Error: ${error.message}</p>
                    <p>Please refresh the page to try again.</p>
                    <button onclick="location.reload()">Refresh Page</button>
                </div>
            `;
        }
    }
});

// Function to set default dates (2 weeks ago to today)
function setDefaultDates() {
    const today = new Date();
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(today.getDate() - 14);
    
    // Format dates as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Set default values for date inputs
    const startDateInput = document.getElementById('startDateInput');
    const endDateInput = document.getElementById('endDateInput');
    
    if (startDateInput) startDateInput.value = formatDate(twoWeeksAgo);
    if (endDateInput) endDateInput.value = formatDate(today);
    
    // Also set default timeframe to 1min
    const timeframeSelect = document.getElementById('timeframeSelect');
    if (timeframeSelect && !timeframeSelect.value) {
        timeframeSelect.value = '1min';
    }
};

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.viewer && window.viewer.chart) {
        window.viewer.chart.destroy();
    }
});