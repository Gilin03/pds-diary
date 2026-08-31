import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { supabase } from './lib/supabase'
import TodoSection from './components/TodoSection'
import './App.css'

const priorityLabels = {
  high: '높음',
  medium: '보통',
  low: '낮음',
}

const priorityIcons = {
  high: '●',
  medium: '●',
  low: '●',
}

const emptyForm = {
  title: '',
  start_date: '',
  end_date: '',
  priority: 'medium',
  success_criteria: '',
  estimated_minutes: '',
}

function getMonthStart(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
  )
}

function formatMonth(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1
    }월`
}

function formatDateLabel(date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function isSameDay(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

function dateFromString(value) {
  if (!value) return null

  const [year, month, day] = value
    .split('-')
    .map(Number)

  return new Date(
    year,
    month - 1,
    day,
  )
}

function App() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState(emptyForm)

  const [editingPlanId, setEditingPlanId] =
    useState(null)

  const [editForm, setEditForm] =
    useState(emptyForm)

  const [versions, setVersions] = useState([])
  const [showHistory, setShowHistory] =
    useState(false)

  const [loadingHistory, setLoadingHistory] =
    useState(false)

  const [calendarMonth, setCalendarMonth] =
    useState(getMonthStart(new Date()))

  const [selectedDate, setSelectedDate] =
    useState(new Date())

  const [selectedPlanId, setSelectedPlanId] =
    useState(null)

  const [deletingPlanId, setDeletingPlanId] =
    useState(null)

  /*
   * 같은 브라우저에서 수정 저장 함수가
   * 동시에 두 번 실행되는 것까지 막는다.
   */
  const editSaveInFlightRef = useRef(false)
  const editChangeKeyRef = useRef(null)

  useEffect(() => {
    loadPlans()
  }, [])

  async function loadPlans() {
    setLoading(true)
    setError('')

    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .order('start_date', {
        ascending: true,
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const loadedPlans = data || []

    setPlans(loadedPlans)

    if (loadedPlans.length > 0) {
      const firstPlan = loadedPlans[0]
      const firstDate = dateFromString(
        firstPlan.start_date,
      )

      setSelectedPlanId(firstPlan.id)

      if (firstDate) {
        setSelectedDate(firstDate)
        setCalendarMonth(
          getMonthStart(firstDate),
        )
      }
    } else {
      setSelectedPlanId(null)
    }

    setLoading(false)
  }

  function handleChange(event) {
    const { name, value } = event.target

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  function handleEditChange(event) {
    const { name, value } = event.target

    setEditForm((previous) => ({
      ...previous,
      [name]: value,
    }))
  }

  function validatePlan(values) {
    if (!values.title.trim()) {
      return '계획명을 입력해주세요.'
    }

    if (
      !values.start_date ||
      !values.end_date
    ) {
      return '시작일과 종료일을 입력해주세요.'
    }

    if (values.end_date < values.start_date) {
      return '종료일은 시작일보다 빠를 수 없습니다.'
    }

    if (!values.success_criteria.trim()) {
      return '성공 기준을 입력해주세요.'
    }

    const estimatedMinutes = Number(
      values.estimated_minutes,
    )

    if (
      !estimatedMinutes ||
      estimatedMinutes <= 0
    ) {
      return '예상 시간은 1분 이상 입력해주세요.'
    }

    return null
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (saving) return

    setMessage('')
    setError('')

    const validationError =
      validatePlan(form)

    if (validationError) {
      setError(validationError)
      return
    }

    setSaving(true)

    try {
      const { data, error } =
        await supabase
          .from('plans')
          .insert({
            title: form.title.trim(),
            start_date: form.start_date,
            end_date: form.end_date,
            priority: form.priority,
            success_criteria:
              form.success_criteria.trim(),
            estimated_minutes: Number(
              form.estimated_minutes,
            ),
          })
          .select()
          .single()

      if (error) {
        throw new Error(error.message)
      }

      const nextPlans = [...plans, data].sort(
        (a, b) =>
          a.start_date.localeCompare(
            b.start_date,
          ),
      )

      setPlans(nextPlans)
      setForm(emptyForm)

      setSelectedPlanId(data.id)

      const newStartDate =
        dateFromString(data.start_date)

      if (newStartDate) {
        setCalendarMonth(
          getMonthStart(newStartDate),
        )
        setSelectedDate(newStartDate)
      }

      setMessage(
        '계획이 서버 데이터베이스에 저장되었습니다.',
      )
    } catch (caughtError) {
      setError(caughtError.message)
    } finally {
      setSaving(false)
    }
  }

  function startEditing(plan) {
    setError('')
    setMessage('')

    setShowHistory(false)
    setVersions([])

    editChangeKeyRef.current =
      crypto.randomUUID()

    setEditingPlanId(plan.id)

    setEditForm({
      title: plan.title,
      start_date: plan.start_date,
      end_date: plan.end_date,
      priority: plan.priority,
      success_criteria:
        plan.success_criteria,
      estimated_minutes: String(
        plan.estimated_minutes,
      ),
    })
  }

  function cancelEditing() {
    setEditingPlanId(null)
    setEditForm(emptyForm)
    setError('')

    editChangeKeyRef.current = null
  }

  function isSamePlanData(
    plan,
    values,
  ) {
    return (
      plan.title === values.title.trim() &&
      plan.start_date ===
      values.start_date &&
      plan.end_date === values.end_date &&
      plan.priority === values.priority &&
      plan.success_criteria ===
      values.success_criteria.trim() &&
      Number(plan.estimated_minutes) ===
      Number(values.estimated_minutes)
    )
  }

  /*
   * 수정 저장.
   *
   * 기존처럼
   * 1. version 조회
   * 2. history insert
   * 3. plan update
   * 를 브라우저에서 따로 실행하지 않는다.
   *
   * Supabase RPC 하나가
   * history + plan update를 처리한다.
   */
  async function saveEdit(event, plan) {
    event.preventDefault()

    if (editSaveInFlightRef.current) {
      return
    }

    editSaveInFlightRef.current = true
    setSaving(true)

    setMessage('')
    setError('')

    try {
      const validationError =
        validatePlan(editForm)

      if (validationError) {
        setError(validationError)
        return
      }

      if (
        isSamePlanData(
          plan,
          editForm,
        )
      ) {
        setError(
          '변경된 내용이 없습니다.',
        )
        return
      }

      /*
       * 수정 시작 시점의 updated_at을 보낸다.
       *
       * DB 함수가 해당 값과 현재 DB 값을 비교한다.
       * 이미 다른 수정이 먼저 완료됐다면
       * 두 번째 요청은 PLAN_ALREADY_CHANGED가 된다.
       */
      const expectedUpdatedAt =
        plan.updated_at

      if (!expectedUpdatedAt) {
        throw new Error(
          '현재 계획의 updated_at 값을 확인할 수 없습니다.',
        )
      }

      const { data, error } =
        await supabase.rpc(
          'update_plan_with_history',
          {
            p_plan_id: plan.id,
            p_title:
              editForm.title.trim(),
            p_start_date:
              editForm.start_date,
            p_end_date:
              editForm.end_date,
            p_priority:
              editForm.priority,
            p_success_criteria:
              editForm.success_criteria.trim(),
            p_estimated_minutes:
              Number(
                editForm.estimated_minutes,
              ),
            p_expected_updated_at:
              expectedUpdatedAt,

            p_change_key:
              editChangeKeyRef.current,
          },
        )

      if (error) {
        /*
         * 다른 요청이 이미 먼저 저장한 경우.
         */
        if (
          error.message.includes(
            'PLAN_ALREADY_CHANGED',
          )
        ) {
          await loadPlans()

          setEditingPlanId(null)
          setEditForm(emptyForm)

          editChangeKeyRef.current = null

          if (plan.id) {
            setSelectedPlanId(plan.id)
            await loadVersions(plan.id)
            setShowHistory(true)
          }

          setMessage(
            '이미 처리된 수정 요청입니다. 수정 이력은 한 건만 저장되었습니다.',
          )

          return
        }

        if (
          error.message.includes(
            'PLAN_NOT_FOUND',
          )
        ) {
          throw new Error(
            '수정하려는 계획을 찾을 수 없습니다.',
          )
        }

        throw new Error(
          `계획 수정에 실패했습니다: ${error.message}`,
        )
      }

      const updatedPlan = data

      if (!updatedPlan) {
        throw new Error(
          '수정 결과를 받지 못했습니다.',
        )
      }

      setPlans((previous) =>
        previous
          .map((item) =>
            item.id === updatedPlan.id
              ? updatedPlan
              : item,
          )
          .sort((a, b) =>
            a.start_date.localeCompare(
              b.start_date,
            ),
          ),
      )

      setSelectedPlanId(
        updatedPlan.id,
      )

      setEditingPlanId(null)
      setEditForm(emptyForm)

      const updatedDate =
        dateFromString(
          updatedPlan.start_date,
        )

      if (updatedDate) {
        setCalendarMonth(
          getMonthStart(updatedDate),
        )

        setSelectedDate(updatedDate)
      }

      await loadVersions(
        updatedPlan.id,
      )

      setShowHistory(true)

      /*
       * 가장 최근 버전 번호를 가져와서
       * 사용자에게 알려준다.
       */
      const {
        data: versionCheck,
        error: versionCheckError,
      } = await supabase
        .from('plan_versions')
        .select('version')
        .eq(
          'plan_id',
          updatedPlan.id,
        )
        .order('version', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle()

      if (versionCheckError) {
        throw new Error(
          `수정은 완료됐지만 이력 확인에 실패했습니다: ${versionCheckError.message}`,
        )
      }

      setMessage(
        `계획이 수정되었습니다. 수정 전 내용은 v${versionCheck?.version || '?'}으로 보존되었습니다.`,
      )
    } catch (caughtError) {
      setError(caughtError.message)
    } finally {
      editSaveInFlightRef.current = false
      setSaving(false)
    }
  }

  async function loadVersions(planId) {
    setLoadingHistory(true)
    setError('')

    const { data, error } =
      await supabase
        .from('plan_versions')
        .select('*')
        .eq('plan_id', planId)
        .order('version', {
          ascending: false,
        })

    if (error) {
      setError(error.message)
    } else {
      setVersions(data || [])
    }

    setLoadingHistory(false)
  }

  async function toggleHistory(planId) {
    setError('')
    setMessage('')

    if (
      showHistory &&
      selectedPlanId === planId
    ) {
      setShowHistory(false)
      return
    }

    setSelectedPlanId(planId)

    await loadVersions(planId)

    setShowHistory(true)
  }

  async function deletePlan(plan) {
    const confirmed = window.confirm(
      `"${plan.title}" 계획을 삭제할까요?\n\n계속하면 이 계획을 더 이상 사용할 수 없습니다.`,
    )

    if (!confirmed) return

    if (deletingPlanId) return

    setError('')
    setMessage('')
    setDeletingPlanId(plan.id)

    try {
      const { error } =
        await supabase
          .from('plans')
          .delete()
          .eq('id', plan.id)

      if (error) {
        throw new Error(error.message)
      }

      setPlans((previous) =>
        previous.filter(
          (item) => item.id !== plan.id,
        ),
      )

      if (selectedPlanId === plan.id) {
        setSelectedPlanId(null)
        setShowHistory(false)
        setVersions([])
      }

      setMessage(
        `"${plan.title}" 계획이 삭제되었습니다.`,
      )
    } catch (caughtError) {
      setError(
        `계획을 삭제하지 못했습니다: ${caughtError.message}`,
      )
    } finally {
      setDeletingPlanId(null)
    }
  }

  function moveMonth(amount) {
    setCalendarMonth(
      (previous) =>
        new Date(
          previous.getFullYear(),
          previous.getMonth() + amount,
          1,
        ),
    )
  }

  function goToday() {
    const today = new Date()

    setCalendarMonth(
      getMonthStart(today),
    )

    setSelectedDate(today)

    const todayLabel =
      formatDateLabel(today)

    const todayPlans = plans.filter(
      (plan) =>
        plan.start_date <= todayLabel &&
        plan.end_date >= todayLabel,
    )

    setSelectedPlanId(
      todayPlans[0]?.id || null,
    )

    setShowHistory(false)
    setVersions([])
  }

  const calendarDays = useMemo(() => {
    const year =
      calendarMonth.getFullYear()

    const month =
      calendarMonth.getMonth()

    const firstDay = new Date(
      year,
      month,
      1,
    )

    const lastDay = new Date(
      year,
      month + 1,
      0,
    )

    const leadingDays =
      firstDay.getDay()

    const daysInMonth =
      lastDay.getDate()

    const cells = []

    for (
      let index = 0;
      index < leadingDays;
      index += 1
    ) {
      const date = new Date(
        year,
        month,
        index - leadingDays + 1,
      )

      cells.push({
        date,
        currentMonth: false,
      })
    }

    for (
      let day = 1;
      day <= daysInMonth;
      day += 1
    ) {
      cells.push({
        date: new Date(
          year,
          month,
          day,
        ),
        currentMonth: true,
      })
    }

    while (cells.length < 42) {
      const lastDate =
        cells[cells.length - 1].date

      const nextDate = new Date(
        lastDate.getFullYear(),
        lastDate.getMonth(),
        lastDate.getDate() + 1,
      )

      cells.push({
        date: nextDate,
        currentMonth: false,
      })
    }

    return cells
  }, [calendarMonth])

  const selectedPlans = useMemo(() => {
    const selectedLabel =
      formatDateLabel(selectedDate)

    return plans.filter(
      (plan) =>
        plan.start_date <= selectedLabel &&
        plan.end_date >= selectedLabel,
    )
  }, [plans, selectedDate])

  const activePlan = useMemo(() => {
    if (selectedPlanId) {
      const selectedPlan =
        plans.find(
          (plan) =>
            plan.id === selectedPlanId,
        )

      if (selectedPlan) {
        return selectedPlan
      }
    }

    return (
      selectedPlans[0] ||
      plans[0] ||
      null
    )
  }, [
    plans,
    selectedPlans,
    selectedPlanId,
  ])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="logo">
            📅
          </div>

          <div>
            <p className="brand-title">
              PlanDoSee Diary
            </p>

            <p className="brand-subtitle">
              PLAN · DO · SEE
            </p>
          </div>
        </div>

        <div className="topbar-right">
          <nav className="mode-links">
            <span className="mode-link active">
              PLAN
            </span>

            <span className="mode-link">
              DO
            </span>

            <span className="mode-link">
              SEE
            </span>
          </nav>

          <div className="public-chip">
            🔓 로그인 없음
          </div>
        </div>
      </header>

      <div className="public-notice">
        🔓{' '}
        <strong>
          지금은 로그인이 없어 링크를 아는 사람은 누구나 볼 수 있습니다.
        </strong>

        <span>
          남이 봐도 괜찮은 내용만 넣으세요.
        </span>
      </div>

      <div className="workspace">
        <aside className="sidebar">
          <p className="sidebar-label">
            WORKSPACE
          </p>

          <button
            className="side-item active"
            type="button"
          >
            📋 <span>내 계획</span>
          </button>

          <button
            className="side-item"
            type="button"
          >
            ✅ <span>할 일</span>
          </button>

          <button
            className="side-item"
            type="button"
          >
            ▶️ <span>실행 기록</span>
          </button>

          <button
            className="side-item"
            type="button"
          >
            📊 <span>돌아보기</span>
          </button>

          <div className="sidebar-divider" />

          <div className="side-stat">
            <div className="side-stat-label">
              현재 계획
            </div>

            <div className="side-stat-value">
              {plans.length}
            </div>
          </div>
        </aside>

        <main className="main-content">
          <section className="section-heading">
            <div className="section-heading-left">
              <p className="section-number">
                CARD 1
              </p>

              <h1>
                계획 세우기
              </h1>
            </div>

            <span className="status-badge">
              PLAN
            </span>
          </section>

          <div className="dashboard-grid">
            <section className="panel calendar-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    📅 계획 캘린더
                  </h2>

                  <p className="panel-description">
                    계획 기간을 달력에서 한눈에 확인하세요.
                  </p>
                </div>
              </div>

              <div className="calendar-toolbar">
                <h2 className="calendar-month">
                  {formatMonth(
                    calendarMonth,
                  )}
                </h2>

                <div className="calendar-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      moveMonth(-1)
                    }
                  >
                    ‹
                  </button>

                  <button
                    type="button"
                    className="icon-button"
                    onClick={goToday}
                  >
                    오늘
                  </button>

                  <button
                    type="button"
                    className="icon-button"
                    onClick={() =>
                      moveMonth(1)
                    }
                  >
                    ›
                  </button>
                </div>
              </div>

              <div className="calendar">
                <div className="weekdays">
                  {[
                    '일',
                    '월',
                    '화',
                    '수',
                    '목',
                    '금',
                    '토',
                  ].map(
                    (weekday) => (
                      <div
                        className="weekday"
                        key={weekday}
                      >
                        {weekday}
                      </div>
                    ),
                  )}
                </div>

                <div className="calendar-grid">
                  {calendarDays.map(
                    ({
                      date,
                      currentMonth,
                    }) => {
                      const dateLabel =
                        formatDateLabel(
                          date,
                        )

                      const dayPlans =
                        plans.filter(
                          (plan) =>
                            plan.start_date <=
                            dateLabel &&
                            plan.end_date >=
                            dateLabel,
                        )

                      const today =
                        isSameDay(
                          date,
                          new Date(),
                        )

                      const selected =
                        isSameDay(
                          date,
                          selectedDate,
                        )

                      return (
                        <button
                          key={dateLabel}
                          type="button"
                          className={`calendar-cell ${currentMonth
                              ? ''
                              : 'muted'
                            } ${today
                              ? 'today'
                              : ''
                            } ${selected
                              ? 'selected'
                              : ''
                            }`}
                          onClick={() => {
                            setSelectedDate(
                              date,
                            )

                            setSelectedPlanId(
                              dayPlans[0]
                                ?.id ||
                              null,
                            )

                            setShowHistory(
                              false,
                            )

                            setVersions([])

                            if (
                              !currentMonth
                            ) {
                              setCalendarMonth(
                                getMonthStart(
                                  date,
                                ),
                              )
                            }
                          }}
                        >
                          <span className="calendar-day-number">
                            {
                              date.getDate()
                            }
                          </span>

                          {dayPlans
                            .slice(0, 2)
                            .map(
                              (plan) => (
                                <span
                                  key={
                                    plan.id
                                  }
                                  className={`calendar-event ${plan.priority}`}
                                  title={
                                    plan.title
                                  }
                                >
                                  <span className="event-dot">
                                    {
                                      priorityIcons[
                                      plan
                                        .priority
                                      ]
                                    }
                                  </span>

                                  {
                                    plan.title
                                  }
                                </span>
                              ),
                            )}

                          {dayPlans.length >
                            2 && (
                              <span className="calendar-more">
                                +
                                {dayPlans.length -
                                  2}
                              </span>
                            )}
                        </button>
                      )
                    },
                  )}
                </div>
              </div>

              <div className="selected-plan-area">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">
                      📌{' '}
                      {formatDateLabel(
                        selectedDate,
                      )}
                    </h2>

                    <p className="panel-description">
                      선택한 날짜에 진행 중인 계획입니다.
                    </p>
                  </div>

                  {selectedPlans.length >
                    0 && (
                      <span className="todo-count">
                        {
                          selectedPlans.length
                        }
                        개
                      </span>
                    )}
                </div>

                {selectedPlans.length ===
                  0 ? (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <span className="empty-icon">
                        🌱
                      </span>

                      <strong>
                        이 날짜에는 계획이 없습니다.
                      </strong>

                      <span>
                        오른쪽에서 계획을 만들어보세요.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="selected-plan-list">
                    {selectedPlans.map(
                      (plan) => {
                        const isActive =
                          activePlan?.id ===
                          plan.id

                        return (
                          <div
                            className={`current-plan ${isActive
                                ? 'selected-current-plan'
                                : ''
                              }`}
                            key={plan.id}
                            onClick={() => {
                              setSelectedPlanId(
                                plan.id,
                              )

                              setShowHistory(
                                false,
                              )

                              setVersions(
                                [],
                              )
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(
                              event,
                            ) => {
                              if (
                                event.key ===
                                'Enter' ||
                                event.key ===
                                ' '
                              ) {
                                setSelectedPlanId(
                                  plan.id,
                                )

                                setShowHistory(
                                  false,
                                )

                                setVersions(
                                  [],
                                )
                              }
                            }}
                          >
                            <div className="current-plan-top">
                              <div
                                className={`priority ${plan.priority}`}
                              >
                                {
                                  priorityLabels[
                                  plan
                                    .priority
                                  ]
                                }
                              </div>

                              <span className="plan-meta">
                                {isActive
                                  ? '선택된 계획'
                                  : '클릭해서 선택'}
                              </span>
                            </div>

                            <h2 className="plan-title">
                              {plan.title}
                            </h2>

                            <div className="plan-date">
                              {
                                plan.start_date
                              }{' '}
                              ~{' '}
                              {
                                plan.end_date
                              }
                            </div>

                            <div className="plan-summary">
                              <div className="summary-box">
                                <div className="summary-label">
                                  🎯 성공 기준
                                </div>

                                <div className="summary-value">
                                  {
                                    plan.success_criteria
                                  }
                                </div>
                              </div>

                              <div className="summary-box">
                                <div className="summary-label">
                                  ⏱ 예상 시간
                                </div>

                                <div className="summary-value">
                                  {
                                    plan.estimated_minutes
                                  }
                                  분
                                </div>
                              </div>
                            </div>

                            <div className="plan-actions">
                              <button
                                type="button"
                                className="action-button primary"
                                onClick={(
                                  event,
                                ) => {
                                  event.stopPropagation()

                                  setSelectedPlanId(
                                    plan.id,
                                  )

                                  startEditing(
                                    plan,
                                  )
                                }}
                              >
                                ✏️ 수정
                              </button>

                              <button
                                type="button"
                                className="action-button"
                                onClick={(
                                  event,
                                ) => {
                                  event.stopPropagation()

                                  setSelectedPlanId(
                                    plan.id,
                                  )

                                  toggleHistory(
                                    plan.id,
                                  )
                                }}
                              >
                                📜 수정 이력
                              </button>

                              <button
                                type="button"
                                className="action-button danger"
                                disabled={
                                  deletingPlanId ===
                                  plan.id
                                }
                                onClick={(
                                  event,
                                ) => {
                                  event.stopPropagation()

                                  deletePlan(
                                    plan,
                                  )
                                }}
                              >
                                {deletingPlanId ===
                                  plan.id
                                  ? '삭제 중...'
                                  : '🗑 삭제'}
                              </button>
                            </div>

                            {editingPlanId ===
                              plan.id && (
                                <form
                                  className="edit-form"
                                  onSubmit={(
                                    event,
                                  ) =>
                                    saveEdit(
                                      event,
                                      plan,
                                    )
                                  }
                                  onClick={(
                                    event,
                                  ) =>
                                    event.stopPropagation()
                                  }
                                >
                                  <div className="edit-form-title">
                                    ✏️ 계획 수정
                                  </div>

                                  <label className="form-label">
                                    계획명

                                    <input
                                      name="title"
                                      value={
                                        editForm.title
                                      }
                                      onChange={
                                        handleEditChange
                                      }
                                    />
                                  </label>

                                  <div className="form-row">
                                    <label className="form-label">
                                      시작일

                                      <input
                                        type="date"
                                        name="start_date"
                                        value={
                                          editForm.start_date
                                        }
                                        onChange={
                                          handleEditChange
                                        }
                                      />
                                    </label>

                                    <label className="form-label">
                                      종료일

                                      <input
                                        type="date"
                                        name="end_date"
                                        value={
                                          editForm.end_date
                                        }
                                        onChange={
                                          handleEditChange
                                        }
                                      />
                                    </label>
                                  </div>

                                  <label className="form-label">
                                    우선순위

                                    <select
                                      name="priority"
                                      value={
                                        editForm.priority
                                      }
                                      onChange={
                                        handleEditChange
                                      }
                                    >
                                      <option value="high">
                                        높음
                                      </option>

                                      <option value="medium">
                                        보통
                                      </option>

                                      <option value="low">
                                        낮음
                                      </option>
                                    </select>
                                  </label>

                                  <label className="form-label">
                                    성공 기준

                                    <textarea
                                      name="success_criteria"
                                      value={
                                        editForm.success_criteria
                                      }
                                      onChange={
                                        handleEditChange
                                      }
                                      rows="3"
                                    />
                                  </label>

                                  <label className="form-label">
                                    예상 시간

                                    <div className="input-with-unit">
                                      <input
                                        type="number"
                                        name="estimated_minutes"
                                        value={
                                          editForm.estimated_minutes
                                        }
                                        onChange={
                                          handleEditChange
                                        }
                                        min="1"
                                      />

                                      <span>
                                        분
                                      </span>
                                    </div>
                                  </label>

                                  {error && (
                                    <div className="form-message error">
                                      ❌ {error}
                                    </div>
                                  )}

                                  <div className="edit-actions">
                                    <button
                                      className="action-button primary"
                                      type="submit"
                                      disabled={
                                        saving
                                      }
                                    >
                                      {saving
                                        ? '저장 중...'
                                        : '💾 수정 저장'}
                                    </button>

                                    <button
                                      className="action-button"
                                      type="button"
                                      onClick={
                                        cancelEditing
                                      }
                                      disabled={
                                        saving
                                      }
                                    >
                                      취소
                                    </button>
                                  </div>
                                </form>
                              )}

                            {showHistory &&
                              activePlan?.id ===
                              plan.id &&
                              (loadingHistory ? (
                                <div className="history-loading">
                                  수정 이력을 불러오는 중...
                                </div>
                              ) : versions.length >
                                0 ? (
                                <div className="history-panel">
                                  <div className="history-title">
                                    📜 수정 전 계획
                                  </div>

                                  <div className="history-list">
                                    {versions.map(
                                      (
                                        version,
                                      ) => (
                                        <div
                                          className="history-item"
                                          key={
                                            version.id
                                          }
                                        >
                                          <div className="history-item-top">
                                            <span className="history-version">
                                              v
                                              {
                                                version.version
                                              }
                                            </span>

                                            <span className="history-time">
                                              수정 전 저장
                                            </span>
                                          </div>

                                          <div className="history-item-grid">
                                            <div>
                                              <strong>
                                                계획:
                                              </strong>{' '}
                                              {
                                                version.title
                                              }
                                            </div>

                                            <div>
                                              <strong>
                                                기간:
                                              </strong>{' '}
                                              {
                                                version.start_date
                                              }{' '}
                                              ~{' '}
                                              {
                                                version.end_date
                                              }
                                            </div>

                                            <div>
                                              <strong>
                                                우선순위:
                                              </strong>{' '}
                                              {
                                                priorityLabels[
                                                version
                                                  .priority
                                                ] ||
                                                version.priority
                                              }
                                            </div>

                                            <div>
                                              <strong>
                                                성공 기준:
                                              </strong>{' '}
                                              {
                                                version.success_criteria
                                              }
                                            </div>

                                            <div>
                                              <strong>
                                                예상 시간:
                                              </strong>{' '}
                                              {
                                                version.estimated_minutes
                                              }
                                              분
                                            </div>
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="history-empty">
                                  아직 수정 이력이 없습니다.
                                </div>
                              ))}
                          </div>
                        )
                      },
                    )}
                  </div>
                )}
              </div>
            </section>

            <section className="panel form-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">
                    ✏️ 새 계획 만들기
                  </h2>

                  <p className="panel-description">
                    기간과 성공 기준까지 구체적으로 정해보세요.
                  </p>
                </div>
              </div>

              <div className="form-panel-inner">
                <form onSubmit={handleSubmit}>
                  <label className="form-label">
                    계획명

                    <input
                      name="title"
                      value={form.title}
                      onChange={handleChange}
                      placeholder="예: T06 플랜두씨 다이어리 완성"
                    />
                  </label>

                  <div className="form-row">
                    <label className="form-label">
                      시작일

                      <input
                        type="date"
                        name="start_date"
                        value={
                          form.start_date
                        }
                        onChange={
                          handleChange
                        }
                      />
                    </label>

                    <label className="form-label">
                      종료일

                      <input
                        type="date"
                        name="end_date"
                        value={
                          form.end_date
                        }
                        onChange={
                          handleChange
                        }
                      />
                    </label>
                  </div>

                  <label className="form-label">
                    우선순위

                    <select
                      name="priority"
                      value={
                        form.priority
                      }
                      onChange={
                        handleChange
                      }
                    >
                      <option value="high">
                        높음
                      </option>

                      <option value="medium">
                        보통
                      </option>

                      <option value="low">
                        낮음
                      </option>
                    </select>
                  </label>

                  <label className="form-label">
                    성공 기준

                    <textarea
                      name="success_criteria"
                      value={
                        form.success_criteria
                      }
                      onChange={
                        handleChange
                      }
                      placeholder="무엇을 하면 이 계획을 성공했다고 볼 것인가?"
                      rows="4"
                    />
                  </label>

                  <label className="form-label">
                    예상 시간

                    <div className="input-with-unit">
                      <input
                        type="number"
                        name="estimated_minutes"
                        value={
                          form.estimated_minutes
                        }
                        onChange={
                          handleChange
                        }
                        min="1"
                        placeholder="예: 600"
                      />

                      <span>
                        분
                      </span>
                    </div>
                  </label>

                  {error && (
                    <div className="form-message error">
                      ❌ {error}
                    </div>
                  )}

                  {message && (
                    <div className="form-message success">
                      ✅ {message}
                    </div>
                  )}

                  <button
                    className="submit-button"
                    type="submit"
                    disabled={saving}
                  >
                    {saving
                      ? '저장 중...'
                      : '📌 계획 저장하기'}
                  </button>
                </form>
              </div>
            </section>
          </div>

          {activePlan && (
            <TodoSection
              planId={activePlan.id}
            />
          )}
        </main>
      </div>
    </div>
  )
}

export default App