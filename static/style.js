// Advanced Trading Data Viewer with TradingView Lightweight Charts
// Requires: https://unpkg.com/lightweight-charts/dist/lightweight-charts.standalone.production.js

class AdvancedTradingViewer {
    constructor() {
        this.charts = [];
        this.instruments = [];
        this.currentData = {};
        this.drawingTools = [];
        this.drawingMode = null;
        this.layout = 1; // 1 or 2 charts
        this.selectedInstruments = [];
        this.supportResistanceEnabled = false;
        this.trendChannelEnabled = false;
        this.breakoutSignalsEnabled = false;
        this.analysisLines = []; // Store S/R and trend lines
        this.breakoutLevels = []; // Track broken S/R levels
        this.signalArrows = []; // Store signal arrows
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
            this.createChartLayout();
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
        // Add chart layout controls and drawing tools to the page
        const controlsRow = document.querySelector('.controls-row');
        if (controlsRow) {
            controlsRow.insertAdjacentHTML('beforeend', `
                <div class="control-group">
                    <label>Layout</label>
                    <select id="layoutSelect">
                        <option value="1">Single Chart</option>
                        <option value="2">Dual Charts</option>
                    </select>
                </div>
                <div class="control-group">
                    <label>Drawing Tools</label>
                    <div class="drawing-tools">
                        <button id="hLineBtn" class="tool-btn" title="Horizontal Line">─</button>
                        <button id="hRayBtn" class="tool-btn" title="Horizontal Ray">→</button>
                        <button id="rectBtn" class="tool-btn" title="Rectangle">▭</button>
                        <button id="clearBtn" class="tool-btn" title="Clear All">✖</button>
                    </div>
                </div>
                <div class="control-group">
                    <label>Saved Drawings</label>
                    <div class="drawing-saves">
                        <select id="savedDrawingsSelect">
                            <option value="">Load saved drawings...</option>
                        </select>
                        <button id="saveDrawingsBtn" class="btn-small">Save</button>
                        <button id="deleteDrawingsBtn" class="btn-small">Delete</button>
                    </div>
                </div>
                <div class="control-group">
                    <label>Technical Analysis</label>
                    <div class="analysis-controls">
                        <label class="checkbox-label">
                            <input type="checkbox" id="supportResistanceToggle">
                            Support/Resistance
                        </label>
                        <label class="checkbox-label">
                            <input type="checkbox" id="trendChannelToggle">
                            Trend Channel
                        </label>
                        <label class="checkbox-label" id="breakoutSignalsLabel" style="opacity: 0.5;">
                            <input type="checkbox" id="breakoutSignalsToggle" disabled>
                            Breakout Signals
                        </label>
                    </div>
                </div>
            `);
        }

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

        // Add second instrument selector for dual layout
        const instrumentGroup = document.querySelector('.control-group');
        if (instrumentGroup) {
            instrumentGroup.insertAdjacentHTML('afterend', `
                <div class="control-group" id="instrument2Group" style="display: none;">
                    <label>Instrument 2</label>
                    <select id="instrumentSelect2">
                        <option value="">Select second instrument...</option>
                    </select>
                </div>
            `);
        }
    }

    populateInstrumentSelects() {
        const selects = ['instrumentSelect', 'instrumentSelect2'];
        selects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (!select) return;

            if (selectId === 'instrumentSelect') {
                select.innerHTML = '<option value="">Select an instrument...</option>';
            }

            this.instruments.forEach(instrument => {
                const option = document.createElement('option');
                option.value = instrument.table_name;
                option.textContent = instrument.display_name;
                select.appendChild(option);
            });
        });
    }

    setupEventListeners() {
        // Layout change
        document.getElementById('layoutSelect')?.addEventListener('change', (e) => {
            this.layout = parseInt(e.target.value);
            this.toggleSecondInstrument();
            this.createChartLayout();
        });

        // Instrument selections
        document.getElementById('instrumentSelect')?.addEventListener('change', (e) => {
            this.selectedInstruments[0] = e.target.value;
        });

        document.getElementById('instrumentSelect2')?.addEventListener('change', (e) => {
            this.selectedInstruments[1] = e.target.value;
        });

        // Load data
        document.getElementById('loadDataBtn')?.addEventListener('click', () => {
            this.loadAllData();
        });

        // Drawing tools
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
    }

    toggleSecondInstrument() {
        const group = document.getElementById('instrument2Group');
        if (group) {
            group.style.display = this.layout === 2 ? 'block' : 'none';
        }
    }

    createChartLayout() {
        // Clear existing charts
        this.charts.forEach(chart => chart.remove());
        this.charts = [];

        const chartContainer = document.getElementById('chart');
        if (!chartContainer) return;

        chartContainer.innerHTML = '';
        chartContainer.style.display = 'flex';
        chartContainer.style.flexDirection = 'column';
        chartContainer.style.gap = '10px';

        // Create chart containers
        for (let i = 0; i < this.layout; i++) {
            const chartDiv = document.createElement('div');
            chartDiv.id = `chart${i + 1}`;
            chartDiv.style.height = this.layout === 1 ? '100%' : '48%';
            chartDiv.style.minHeight = '300px';
            chartContainer.appendChild(chartDiv);

            // Create Lightweight Chart
            const chart = LightweightCharts.createChart(chartDiv, {
                width: chartDiv.clientWidth,
                height: chartDiv.clientHeight,
                layout: {
                    background: { color: '#ffffff' },
                    textColor: '#333333',
                },
                grid: {
                    vertLines: { color: '#f0f3fa' },
                    horzLines: { color: '#f0f3fa' },
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Normal,
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                },
                rightPriceScale: {
                    borderVisible: false,
                },
            });

            // Add candlestick series
            const candlestickSeries = chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
            });

            // Add volume series
            const volumeSeries = chart.addHistogramSeries({
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
        }

        // Handle resize
        window.addEventListener('resize', () => {
            this.charts.forEach(({ chart }) => {
                chart.applyOptions({
                    width: chart.options().width,
                    height: chart.options().height
                });
            });
        });
    }

    setupChartDrawing(chart, chartIndex) {
        chart.subscribeClick((param) => {
            if (!this.drawingMode || !param.time) return;

            const price = param.seriesPrices.values().next().value;
            if (!price) return;

            this.addDrawing(chartIndex, this.drawingMode, {
                time: param.time,
                price: typeof price === 'object' ? price.close : price
            });
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

    setDrawingMode(mode) {
        this.drawingMode = this.drawingMode === mode ? null : mode;
        
        // Update tool button states
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.remove('active');
        });

        if (this.drawingMode) {
            const btnId = mode === 'hline' ? 'hLineBtn' : 
                         mode === 'hray' ? 'hRayBtn' : 'rectBtn';
            document.getElementById(btnId)?.classList.add('active');
        }

        // Change cursor
        document.querySelectorAll('[id^="chart"]').forEach(chartDiv => {
            chartDiv.style.cursor = this.drawingMode ? 'crosshair' : 'default';
        });
    }

    clearAllDrawings() {
        this.drawingTools = [];
        this.charts.forEach(chartObj => {
            chartObj.drawings = [];
            // Note: Lightweight Charts doesn't have a direct way to remove price lines
            // In a full implementation, you'd need to track and remove individual lines
        });
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
            this.analysisLines.push({ chartIndex, type: 'support', line: priceLine });
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
            this.analysisLines.push({ chartIndex, type: 'resistance', line: priceLine });
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
            line: upperPriceLine,
            direction: channel.direction
        });
        this.analysisLines.push({ 
            chartIndex, 
            type: 'trend_lower', 
            line: lowerPriceLine,
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
        // Note: Lightweight Charts doesn't provide direct removal of price lines
        // In a full implementation, you'd need to track and manage line references
        this.analysisLines = [];
    }

    // Breakout Signal Detection Methods
    toggleBreakoutSignals() {
        const toggle = document.getElementById('breakoutSignalsToggle');
        const label = document.getElementById('breakoutSignalsLabel');
        
        if (this.supportResistanceEnabled) {
            toggle.disabled = false;
            label.style.opacity = '1';
        } else {
            toggle.disabled = true;
            toggle.checked = false;
            this.breakoutSignalsEnabled = false;
            label.style.opacity = '0.5';
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
        
        // Add marker to chart
        chartObj.candlestickSeries.setMarkers([
            ...(chartObj.markers || []),
            marker
        ]);
        
        // Store for cleanup
        this.signalArrows.push({
            chartIndex,
            marker,
            signal
        });
        
        // Store markers reference
        if (!chartObj.markers) chartObj.markers = [];
        chartObj.markers.push(marker);
    }

    clearSignalArrows() {
        this.charts.forEach((chartObj, index) => {
            if (chartObj.markers) {
                // Remove only signal arrows, keep other markers
                const nonSignalMarkers = chartObj.markers.filter(marker => 
                    !this.signalArrows.some(arrow => arrow.marker === marker)
                );
                chartObj.candlestickSeries.setMarkers(nonSignalMarkers);
                chartObj.markers = nonSignalMarkers;
            }
        });
        
        this.signalArrows = [];
    }

    // Drawing persistence methods
    async loadSavedDrawingsList() {
        try {
            const response = await fetch('/api/drawings');
            if (!response.ok) return;
            
            const drawings = await response.json();
            const select = document.getElementById('savedDrawingsSelect');
            if (select) {
                select.innerHTML = '<option value="">Load saved drawings...</option>';
                drawings.forEach(drawing => {
                    const option = document.createElement('option');
                    option.value = drawing.id;
                    option.textContent = `${drawing.name} (${drawing.created_at})`;
                    select.appendChild(option);
                });
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
                start_date: document.getElementById('startDate')?.value,
                end_date: document.getElementById('endDate')?.value,
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
                const startDate = document.getElementById('startDate');
                if (startDate) startDate.value = savedData.start_date;
            }
            if (savedData.end_date) {
                const endDate = document.getElementById('endDate');
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
        
        for (let i = 0; i < this.layout; i++) {
            const instrument = this.selectedInstruments[i];
            if (instrument) {
                promises.push(this.loadDataForChart(i, instrument));
            }
        }

        try {
            await Promise.all(promises);
        } catch (error) {
            console.error('Error loading data:', error);
            this.showError('Failed to load data');
        }
    }

    async loadDataForChart(chartIndex, instrument) {
        const timeframe = document.getElementById('timeframeSelect')?.value || '1min';
        const startDate = document.getElementById('startDate')?.value;
        const endDate = document.getElementById('endDate')?.value;

        const params = new URLSearchParams({ timeframe });
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);

        const response = await fetch(`/api/data/${instrument}?${params}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        this.currentData[instrument] = data;

        if (data.length === 0) {
            this.showNoDataForChart(chartIndex);
            return;
        }

        this.renderDataToChart(chartIndex, data, instrument);
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
        
        // Apply technical analysis if enabled
        setTimeout(() => {
            this.updateTechnicalAnalysis();
        }, 100);
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
    }

    closeDownloadModal() {
        document.getElementById('downloadModal').style.display = 'none';
    }
}

// Global functions for HTML onclick handlers
function closeDownloadModal() {
    if (window.viewer) {
        window.viewer.closeDownloadModal();
    }
}

// Initialize when DOM and Lightweight Charts are loaded
document.addEventListener('DOMContentLoaded', () => {
    if (typeof LightweightCharts !== 'undefined') {
        window.viewer = new AdvancedTradingViewer();
    } else {
        console.error('TradingView Lightweight Charts library not loaded');
    }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.viewer && window.viewer.chart) {
        window.viewer.chart.destroy();
    }
});