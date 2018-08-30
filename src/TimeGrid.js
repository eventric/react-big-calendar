import PropTypes from 'prop-types';
import React, { Component } from 'react';
import cn from 'classnames';
import { findDOMNode } from 'react-dom';

import dates from './utils/dates';
import localizer from './localizer'
import DayColumn from './DayColumn';
import TimeColumn from './TimeColumn';
import DateContentRow from './DateContentRow';
import Header from './Header';

import getWidth from 'dom-helpers/query/width';
import scrollbarSize from 'dom-helpers/util/scrollbarSize';
import message from './utils/messages';

import { accessor, dateFormat } from './utils/propTypes';

import { notify } from './utils/helpers';

import { accessor as get } from './utils/accessors';

import { inRange, sortEvents, segStyle } from './utils/eventLevels';

export default class TimeGrid extends Component {

  static propTypes = {
    events: PropTypes.array.isRequired,

    step: PropTypes.number,
    range: PropTypes.arrayOf(
      PropTypes.instanceOf(Date)
    ),
    min: PropTypes.instanceOf(Date),
    max: PropTypes.instanceOf(Date),
    getNow: PropTypes.func.isRequired,

    scrollToTime: PropTypes.instanceOf(Date),
    eventPropGetter: PropTypes.func,
    dayPropGetter: PropTypes.func,
    dayFormat: dateFormat,
    showMultiDayTimes: PropTypes.bool,
    culture: PropTypes.string,

    rtl: PropTypes.bool,
    width: PropTypes.number,

    titleAccessor: accessor.isRequired,
    allDayAccessor: accessor.isRequired,
    startAccessor: accessor.isRequired,
    endAccessor: accessor.isRequired,

    selected: PropTypes.object,
    selectable: PropTypes.oneOf([true, false, 'ignoreEvents']),
    longPressThreshold: PropTypes.number,

    onNavigate: PropTypes.func,
    onSelectSlot: PropTypes.func,
    onSelectEnd: PropTypes.func,
    onSelectStart: PropTypes.func,
    onSelectEvent: PropTypes.func,
    onDoubleClickEvent: PropTypes.func,
    onDrillDown: PropTypes.func,
    getDrilldownView: PropTypes.func.isRequired,

    messages: PropTypes.object,
    components: PropTypes.object.isRequired,

    currentTimeIndicatorVisible: PropTypes.bool
  }

  static defaultProps = {
    step: 30,
    min: dates.startOf(new Date(), 'day'),
    max: dates.endOf(new Date(), 'day'),
    scrollToTime: dates.startOf(new Date(), 'day'),
    currentTimeIndicatorVisible: true,
    /* This is needed to satisfy requirements from TimeColumn required props
     * There is a strange bug in React, using ...TimeColumn.defaultProps causes weird crashes
     */
    type: 'gutter',
  }

  constructor(props) {
    super(props)
    this.state = { gutterWidth: undefined, isOverflowing: null };
    this.handleSelectEvent = this.handleSelectEvent.bind(this)
    this.handleDoubleClickEvent = this.handleDoubleClickEvent.bind(this)
    this.handleHeaderClick = this.handleHeaderClick.bind(this)
  }

  componentWillMount() {
    this._gutters = [];
    this.calculateScroll(this.props);
  }

  componentDidMount() {
    this.checkOverflow();

    if (this.props.width == null) {
      this.measureGutter()
    }
    this.applyScroll();

    this.positionTimeIndicator();
    this.triggerTimeIndicatorUpdate();
  }

  componentWillUnmount() {
    window.clearTimeout(this._timeIndicatorTimeout);
  }

  componentDidUpdate() {
    if (this.props.width == null && !this.state.gutterWidth) {
      this.measureGutter()
    }

    this.applyScroll();
    this.positionTimeIndicator();
    //this.checkOverflow()
  }

  componentWillReceiveProps(nextProps) {
    const { range, scrollToTime } = this.props;
    // When paginating, reset scroll
    if (
      !dates.eq(nextProps.range[0], range[0], 'minute') ||
      !dates.eq(nextProps.scrollToTime, scrollToTime, 'minute')
    ) {
      this.calculateScroll(nextProps);
    }
  }

  handleSelectAllDaySlot = (slots, slotInfo) => {
    const { onSelectSlot } = this.props;
    notify(onSelectSlot, {
      slots,
      start: slots[0],
      end: slots[slots.length - 1],
      action: slotInfo.action
    })
  }

  render() {
    let {
        events
      , range
      , width
    } = this.props;

    width = width || this.state.gutterWidth;

    this.slots = range.length;

    let gutterRef = ref => this._gutters[1] = ref && findDOMNode(ref);
    this.timeIndicator = null;

    return (
      <div className='rbc-time-view'>

        <div ref={ref => this.content = ref} className='rbc-time-content'>
          <div ref={ref => this.timeIndicator = ref} className='rbc-current-time-indicator' />

          <TimeColumn
            {...this.props}
            showLabels
            style={{ width }}
            ref={gutterRef}
            className='rbc-time-gutter'
          />

          {this.renderEvents(range, events, this.props.now)}

        </div>
      </div>
    );
  }

  renderEvents(range, events, today){
    let { min, max, components } = this.props;

    return range.map((date, idx) => {
      let daysEvents = events;

      return (
        <DayColumn
          {...this.props }
          min={dates.merge(date, min)}
          max={dates.add(dates.merge(date, min), dates.diff(max, min), 'milliseconds')}
          eventComponent={components.event}
          eventContentComponent={components.eventContent}
          eventWrapperComponent={components.eventWrapper}
          dayWrapperComponent={components.dayWrapper}
          className={cn({ 'rbc-now': dates.eq(date, today, 'day') })}
          style={segStyle(1, this.slots)}
          key={idx}
          date={date}
          events={daysEvents}
        />
      )
    })
  }

  renderHeader(range, events, width) {
    let { messages, rtl, selectable, components, getNow } = this.props;
    let { isOverflowing } = this.state || {};

    let style = {};
    if (isOverflowing)
      style[rtl ? 'marginLeft' : 'marginRight'] = scrollbarSize() + 'px';

    return (
      <div
        ref='headerCell'
        className={cn(
          'rbc-time-header',
          isOverflowing && 'rbc-overflowing'
        )}
        style={style}
      >
        <div className='rbc-row'>
          <div
            className='rbc-label rbc-header-gutter'
            style={{ width }}
          />
          { this.renderHeaderCells(range) }
        </div>
        <div className='rbc-row'>
          <div
            ref={ref => this._gutters[0] = ref}
            className='rbc-label rbc-header-gutter'
            style={{ width }}
          >
            { message(messages).allDay }
          </div>
          <DateContentRow
            getNow={getNow}
            minRows={2}
            range={range}
            rtl={this.props.rtl}
            events={events}
            className='rbc-allday-cell'
            selectable={selectable}
            onSelectSlot={this.handleSelectAllDaySlot}
            dateCellWrapper={components.dateCellWrapper}
            dayPropGetter={this.props.dayPropGetter}
            eventComponent={this.props.components.event}
            eventWrapperComponent={this.props.components.eventWrapper}
            titleAccessor={this.props.titleAccessor}
            startAccessor={this.props.startAccessor}
            endAccessor={this.props.endAccessor}
            allDayAccessor={this.props.allDayAccessor}
            eventPropGetter={this.props.eventPropGetter}
            selected={this.props.selected}
            onSelect={this.handleSelectEvent}
            onDoubleClick={this.handleDoubleClickEvent}
            longPressThreshold={this.props.longPressThreshold}
          />
        </div>
      </div>
    )
  }

  renderHeaderCells(range){
    let { dayFormat, culture, components, dayPropGetter, getNow, getDrilldownView } = this.props;
    let HeaderComponent = components.header || Header

    return range.map((date, i) => {
      let drilldownView = getDrilldownView(date);
      let label = localizer.format(date, dayFormat, culture);

      const { className, style: dayStyles } = (dayPropGetter && dayPropGetter(date)) || {};
      const today = getNow()

      let header = (
        <HeaderComponent
          date={date}
          label={label}
          localizer={localizer}
          format={dayFormat}
          culture={culture}
        />
      )

      return (
        <div
          key={i}
          className={cn(
            'rbc-header',
            className,
            dates.eq(date, today, 'date') && 'rbc-today',
          )}
          style={Object.assign({}, dayStyles, segStyle(1, this.slots))}
        >
          {drilldownView ? (
            <a
              href='#'
              onClick={e => this.handleHeaderClick(date, drilldownView, e)}
            >
              {header}
            </a>
          ) : (
            <span>
              {header}
            </span>
          )}
        </div>
      )
    })
  }

  handleHeaderClick(date, view, e){
    e.preventDefault()
    notify(this.props.onDrillDown, [date, view])
  }

  handleSelectEvent(...args) {
    notify(this.props.onSelectEvent, args)
  }

  handleDoubleClickEvent(...args) {
    notify(this.props.onDoubleClickEvent, args)
  }

  handleSelectAlldayEvent(...args) {
    //cancel any pending selections so only the event click goes through.
    this.clearSelection()
    notify(this.props.onSelectEvent, args)
  }

  clearSelection(){
    clearTimeout(this._selectTimer)
    this._pendingSelection = [];
  }

  measureGutter() {
    let width = this.state.gutterWidth;
    let gutterCells = this._gutters;

    if (!width) {
      width = Math.max(...gutterCells.map(getWidth));

      if (width) {
        this.setState({ gutterWidth: width })
      }
    }
  }

  applyScroll() {
    if (this._scrollRatio) {
      this.content.scrollTop = this.content.scrollHeight * this._scrollRatio;
      // Only do this once
      this._scrollRatio = null;
    }
  }

  calculateScroll(props) {
    const { min, max, scrollToTime } = props;

    const diffMillis = scrollToTime - dates.startOf(scrollToTime, 'day');
    const totalMillis = dates.diff(max, min);

    this._scrollRatio = diffMillis / totalMillis;
  }

  checkOverflow() {
    if (this._updatingOverflow) return;

    let isOverflowing = this.content.scrollHeight > this.content.clientHeight;

    if (this.state.isOverflowing !== isOverflowing) {
      this._updatingOverflow = true;
      this.setState({ isOverflowing }, () => {
        this._updatingOverflow = false;
      })
    }
  }

  positionTimeIndicator() {
    const { rtl, min, max, getNow } = this.props
    const current = getNow()

    const secondsGrid = dates.diff(max, min, 'seconds');
    const secondsPassed = dates.diff(current, min, 'seconds');

    const timeIndicator = this.timeIndicator;
    const factor = secondsPassed / secondsGrid;
    const timeGutter = this._gutters[this._gutters.length - 1];

    if (timeIndicator) {
      if (timeGutter && current >= min && current <= max && this.props.currentTimeIndicatorVisible) {
        const pixelHeight = timeGutter.offsetHeight;
        const offset = Math.floor(factor * pixelHeight);

        timeIndicator.style.display = 'block';
        timeIndicator.style[rtl ? 'left' : 'right'] = 0;
        timeIndicator.style[rtl ? 'right' : 'left'] = timeGutter.offsetWidth + 'px';
        timeIndicator.style.top = offset + 'px';
      } else {
        timeIndicator.style.display = 'none';
      }
    }
  }

  triggerTimeIndicatorUpdate() {
    // Update the position of the time indicator every minute
    this._timeIndicatorTimeout = window.setTimeout(() => {
      this.positionTimeIndicator();

      this.triggerTimeIndicatorUpdate();
    }, 60000)
  }
}
