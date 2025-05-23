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

    async init() {
        try {
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
            
            // Auto-load data after layout change
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

        // Keep the load data button for manual refresh
        document.getElementById('loadDataBtn')?.addEventListener('click', () => {
            this.loadAllData();
        });

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
            shiftVisibleRangeOnNewBar: true
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
            // Sync crosshair from chart 1 to chart 2
            chart1Element.addEventListener('mousemove', (e) => {
                if (!this.timeSync) return;
                
                // Get coordinates relative to chart1
                const rect1 = chart1Element.getBoundingClientRect();
                const x = e.clientX - rect1.left;
                
                // Calculate the same relative position for chart2
                const rect2 = chart2Element.getBoundingClientRect();
                const chart2X = x * (rect2.width / rect1.width);
                
                // Create and dispatch a new mouse event on chart2
                const moveEvent = new MouseEvent('mousemove', {
                    clientX: rect2.left + chart2X,
                    clientY: e.clientY,
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                
                // Only dispatch if mouse is over chart1
                if (e.target.closest('#chart1')) {
                    chart2Element.dispatchEvent(moveEvent);
                }
            });
            
            // Sync crosshair from chart 2 to chart 1
            chart2Element.addEventListener('mousemove', (e) => {
                if (!this.timeSync) return;
                
                // Get coordinates relative to chart2
                const rect2 = chart2Element.getBoundingClientRect();
                const x = e.clientX - rect2.left;
                
                // Calculate the same relative position for chart1
                const rect1 = chart1Element.getBoundingClientRect();
                const chart1X = x * (rect1.width / rect2.width);
                
                // Create and dispatch a new mouse event on chart1
                const moveEvent = new MouseEvent('mousemove', {
                    clientX: rect1.left + chart1X,
                    clientY: e.clientY,
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                
                // Only dispatch if mouse is over chart2
                if (e.target.closest('#chart2')) {
                    chart1Element.dispatchEvent(moveEvent);
                }
            });
        }
        
        // Initial sync from chart 1 to chart 2
        syncHandler1();
        
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
                                labelVisible: false,
                            },
                            horzLine: {
                                labelVisible: true,
                            },
                        },
                        timeScale: {
                            timeVisible: true,
                            secondsVisible: false,
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

    setupChartDrawing(chart, chartIndex) {
        chart.subscribeClick((param) => {
            if (!this.drawingMode || !param.time) return;

            try {
                // In Lightweight Charts v5, we use seriesData instead of seriesPrices
                let price = null;
                
                // Get the first available series data
                if (param.seriesData && param.seriesData.size > 0) {
                    // Get the first series data entry
                    const firstSeries = Array.from(param.seriesData.values())[0];
                    if (firstSeries) {
                        // Extract price from the data point
                        price = typeof firstSeries === 'object' ? 
                            (firstSeries.close || firstSeries.value) : 
                            firstSeries;
                    }
                }
                
                if (!price) {
                    // Fallback: use the y-coordinate if available
                    if (param.point && typeof param.point.y === 'number') {
                        const priceScale = chart.priceScale('right');
                        if (priceScale) {
                            price = priceScale.coordinateToPrice(param.point.y);
                        }
                    }
                }
                
                if (!price) return;
                
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

    async loadAllData() {
        const promises = [];
        
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
        
        for (let i = 0; i < this.layout; i++) {
            const instrument = this.selectedInstruments[i];
            if (instrument) {
                promises.push(this.loadDataForChart(i, instrument));
            }
        }

        try {
            await Promise.all(promises);
            
            // Apply time synchronization if enabled and in dual chart mode
            if (this.layout === 2 && this.timeSync) {
                this.applySyncTimeSettings();
            }
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data');
        }
    }

    async loadDataForChart(chartIndex, instrument) {
        const timeframe = document.getElementById('timeframeSelect')?.value || '1min';
        const startDate = document.getElementById('startDateInput')?.value;
        const endDate = document.getElementById('endDateInput')?.value;
        
        // First, load just the most recent 250 bars for quick display
        const initialParams = new URLSearchParams({ 
            timeframe,
            limit: '250'  // Request only 250 bars initially
        });
        
        try {
            // Show loading indicator
            this.showLoadingForChart(chartIndex);
            
            // First fetch - get the most recent 250 bars
            const initialResponse = await fetch(`/api/data/${instrument}?${initialParams}`);
            if (!initialResponse.ok) throw new Error(`HTTP ${initialResponse.status}`);
            
            const initialData = await initialResponse.json();
            
            // Store and render the initial data
            this.currentData[instrument] = initialData;
            
            if (initialData.length === 0) {
                this.showNoDataForChart(chartIndex);
                return;
            }
            
            // Render the initial data to show something quickly
            this.renderDataToChart(chartIndex, initialData, instrument);
            
            // Now fetch the complete dataset in the background
            const fullParams = new URLSearchParams({ timeframe });
            if (startDate) fullParams.append('start_date', startDate);
            if (endDate) fullParams.append('end_date', endDate);
            
            // Second fetch - get all the data based on date range
            const fullResponse = await fetch(`/api/data/${instrument}?${fullParams}`);
            if (!fullResponse.ok) throw new Error(`HTTP ${fullResponse.status}`);
            
            const fullData = await fullResponse.json();
            
            // Store the complete data
            this.currentData[instrument] = fullData;
            
            // If we got more data than the initial fetch, update the chart
            if (fullData.length > initialData.length) {
                this.renderDataToChart(chartIndex, fullData, instrument);
                console.log(`Loaded additional ${fullData.length - initialData.length} bars for ${instrument}`);
            }
        } catch (error) {
            console.error(`Error loading data for ${instrument}:`, error);
            this.showErrorForChart(chartIndex, `Failed to load data for ${instrument}`);
        }
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
        const chartObj = this.charts[chartIndex];
        if (!chartObj) return;

        // Prepare candlestick data
        const candlestickData = data.map(item => ({
            time: new Date(item.datetime).getTime() / 1000,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close
        }));

        // Prepare volume data
        const volumeData = data.map(item => ({
            time: new Date(item.datetime).getTime() / 1000,
            value: item.volume,
            color: item.close >= item.open ? '#26a69a80' : '#ef535080'
        }));

        chartObj.candlestickSeries.setData(candlestickData);
        chartObj.volumeSeries.setData(volumeData);

        // Update chart title
        this.updateChartTitle(chartIndex, instrument);
        
        // Remove loading indicator
        this.removeLoadingIndicator(chartIndex);
        
        // Apply technical analysis if enabled
        setTimeout(() => {
            this.updateTechnicalAnalysis();
        }, 100);
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
        if (this.selectedInstruments.filter(Boolean).length === 0) {
            this.showError('Please load data first');
            return;
        }
        document.getElementById('downloadModal').style.display = 'block';
        
        // Set up format option selection if not already done
        if (!this.downloadModalInitialized) {
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
            document.getElementById('confirmDownload').addEventListener('click', () => {
                const selectedFormat = document.querySelector('.format-option.selected').getAttribute('data-format');
                this.downloadData(selectedFormat);
                this.closeDownloadModal();
            });
            
            this.downloadModalInitialized = true;
        }
    }

    closeDownloadModal() {
        document.getElementById('downloadModal').style.display = 'none';
    }
    
    downloadData(format) {
        // Get the currently selected instrument
        const instrumentName = this.selectedInstruments[0];
        if (!instrumentName || !this.currentData[instrumentName]) {
            this.showError('No data available to download');
            return;
        }
        
        const data = this.currentData[instrumentName];
        let content, filename, mimeType;
        
        // Format the data according to the selected format
        if (format === 'csv') {
            // Create CSV content
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(row => Object.values(row).join(',')).join('\\n');
            content = headers + '\\n' + rows;
            filename = `${instrumentName}_data.csv`;
            mimeType = 'text/csv';
        } else if (format === 'json') {
            // Create JSON content
            content = JSON.stringify(data, null, 2);
            filename = `${instrumentName}_data.json`;
            mimeType = 'application/json';
        } else {
            this.showError('Invalid format selected');
            return;
        }
        
        // Create a download link and trigger it
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// Global functions for HTML onclick handlers
function closeDownloadModal() {
    if (window.viewer) {
        window.viewer.closeDownloadModal();
    } else {
        document.getElementById('downloadModal').style.display = 'none';
    }
    if (window.viewer) {
        window.viewer.closeDownloadModal();
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
