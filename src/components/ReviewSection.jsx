import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '../lib/supabase'

function getSeoulToday() {
  const parts = new Intl.DateTimeFormat(
    'en-CA',
    {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).formatToParts(new Date())

  const values = {}

  parts.forEach((part) => {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day'
    ) {
      values[part.type] = part.value
    }
  })

  return `${values.year}-${values.month}-${values.day}`
}

function ReviewSection({
  planId,
  plan,
}) {
  const [todos, setTodos] = useState([])
  const [executions, setExecutions] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [selectedMetric, setSelectedMetric] =
    useState(null)

  const [improvement, setImprovement] =
    useState('')

  const [creatingNextPlan, setCreatingNextPlan] =
    useState(false)

  const [nextPlanMessage, setNextPlanMessage] =
    useState('')

  useEffect(() => {
    if (!planId) {
      setTodos([])
      setExecutions([])
      setLoading(false)
      return
    }

    loadReviewData()
  }, [planId])

  useEffect(() => {
    function reloadReview() {
      if (planId) {
        loadReviewData()
      }
    }

    window.addEventListener(
      'todo-completion-changed',
      reloadReview,
    )

    window.addEventListener(
      'execution-record-changed',
      reloadReview,
    )

    window.addEventListener(
      'todo-data-changed',
      reloadReview,
    )

    return () => {
      window.removeEventListener(
        'todo-completion-changed',
        reloadReview,
      )

      window.removeEventListener(
        'execution-record-changed',
        reloadReview,
      )

      window.removeEventListener(
        'todo-data-changed',
        reloadReview,
      )
    }
  }, [planId])

  async function loadReviewData() {
    setLoading(true)
    setError('')

    try {
      const {
        data: todoData,
        error: todoError,
      } = await supabase
        .from('todos')
        .select('*')
        .eq('plan_id', planId)
        .order('created_at', {
          ascending: true,
        })

      if (todoError) {
        throw new Error(
          `할 일 조회 실패: ${todoError.message}`,
        )
      }

      const loadedTodos = todoData || []

      setTodos(loadedTodos)

      const todoIds = loadedTodos.map(
        (todo) => todo.id,
      )

      if (todoIds.length === 0) {
        setExecutions([])
        setLoading(false)
        return
      }

      const {
        data: executionData,
        error: executionError,
      } = await supabase
        .from('execution_records')
        .select('*')
        .in('todo_id', todoIds)
        .order('created_at', {
          ascending: false,
        })

      if (executionError) {
        throw new Error(
          `실행 기록 조회 실패: ${executionError.message}`,
        )
      }

      setExecutions(executionData || [])
    } catch (caughtError) {
      setError(caughtError.message)
    } finally {
      setLoading(false)
    }
  }

  const executionMap = useMemo(() => {
    const map = {}

    executions.forEach((record) => {
      if (!map[record.todo_id]) {
        map[record.todo_id] = []
      }

      map[record.todo_id].push(record)
    })

    return map
  }, [executions])

  const totalTodos = todos.length

  // C29: 현재 완료 상태인 할 일
  const completedTodos = todos.filter(
    (todo) => todo.status === 'completed',
  ).length

  const inProgressTodos =
    totalTodos - completedTodos

  const completionRate =
    totalTodos === 0
      ? 0
      : Math.round(
          (completedTodos / totalTodos) * 100,
        )

  const seoulToday = getSeoulToday()

  // C30:
  // 미완료 + 마감일이 서울 기준 오늘보다 이전
  const overdueTodos = todos.filter(
    (todo) =>
      todo.status !== 'completed' &&
      todo.due_date &&
      todo.due_date < seoulToday,
  )

  // C31:
  // 실행 기록 중 막힌 이유가 하나라도 있으면 막힘
  const blockedTodos = todos.filter(
    (todo) => {
      const records =
        executionMap[todo.id] || []

      return records.some(
        (record) =>
          Boolean(
            record.blocked_reason?.trim(),
          ),
      )
    },
  )

  // C32
  const estimatedTotal = todos.reduce(
    (sum, todo) =>
      sum +
      Number(
        todo.estimated_minutes || 0,
      ),
    0,
  )

  const actualTotal = executions.reduce(
    (sum, execution) =>
      sum +
      Number(
        execution.actual_minutes || 0,
      ),
    0,
  )

  const timeDifference =
    actualTotal - estimatedTotal

  const metricDefinitions = {
    total: {
      label: '전체 할 일',
      count: totalTodos,
      todos,
    },

    completed: {
      label: '완료',
      count: completedTodos,
      todos: todos.filter(
        (todo) =>
          todo.status === 'completed',
      ),
    },

    overdue: {
      label: '지연',
      count: overdueTodos.length,
      todos: overdueTodos,
    },

    blocked: {
      label: '막힘',
      count: blockedTodos.length,
      todos: blockedTodos,
    },
  }

  const selectedMetricData =
    selectedMetric
      ? metricDefinitions[selectedMetric]
      : null

  function toggleMetric(metric) {
    setSelectedMetric((previous) =>
      previous === metric
        ? null
        : metric,
    )
  }

  function formatDifference(value) {
    if (value > 0) {
      return `+${value}분`
    }

    if (value < 0) {
      return `${value}분`
    }

    return '0분'
  }

  function getDifferenceClass(value) {
    if (value > 0) {
      return 'review-over'
    }

    if (value < 0) {
      return 'review-under'
    }

    return 'review-even'
  }

  function formatDateTime(value) {
    if (!value) {
      return '-'
    }

    const date = new Date(value)

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      return '-'
    }

    return date.toLocaleString(
      'ko-KR',
      {
        timeZone: 'Asia/Seoul',
      },
    )
  }

  function getTodoActualMinutes(todoId) {
    const records =
      executionMap[todoId] || []

    return records.reduce(
      (sum, record) =>
        sum +
        Number(
          record.actual_minutes || 0,
        ),
      0,
    )
  }

  function getLatestRecord(todoId) {
    const records =
      executionMap[todoId] || []

    return records[0] || null
  }

  async function createNextPlan() {
    const trimmedImprovement =
      improvement.trim()

    if (!trimmedImprovement) {
      setNextPlanMessage(
        '다음 계획으로 넘길 고칠 점을 입력해주세요.',
      )
      return
    }

    if (!plan) {
      setNextPlanMessage(
        '현재 계획 정보를 찾을 수 없습니다.',
      )
      return
    }

    if (creatingNextPlan) {
      return
    }

    setCreatingNextPlan(true)
    setNextPlanMessage('')

    try {
      const startDate = new Date(
        `${plan.end_date}T00:00:00`,
      )

      startDate.setDate(
        startDate.getDate() + 1,
      )

      const nextStartDate =
        `${startDate.getFullYear()}-${String(
          startDate.getMonth() + 1,
        ).padStart(2, '0')}-${String(
          startDate.getDate(),
        ).padStart(2, '0')}`

      const {
        data,
        error: insertError,
      } = await supabase
        .from('plans')
        .insert({
          title: `${plan.title} · 개선`,
          start_date: nextStartDate,
          end_date: nextStartDate,
          priority: plan.priority,
          success_criteria:
            trimmedImprovement,
          estimated_minutes:
            Number(
              plan.estimated_minutes || 0,
            ),
        })
        .select()
        .single()

      if (insertError) {
        throw new Error(
          insertError.message,
        )
      }

      setImprovement('')

      setNextPlanMessage(
        `다음 계획 "${data.title}"을 만들었습니다.`,
      )

      window.dispatchEvent(
        new CustomEvent(
          'plan-data-changed',
          {
            detail: {
              plan: data,
            },
          },
        ),
      )
    } catch (caughtError) {
      setNextPlanMessage(
        `다음 계획 생성 실패: ${caughtError.message}`,
      )
    } finally {
      setCreatingNextPlan(false)
    }
  }

  if (!planId) {
    return null
  }

  return (
    <section
      id="review-section"
      className="review-section panel"
    >
      <div className="panel-header">
        <div>
          <h2 className="panel-title">
            📊 돌아보기
          </h2>

          <p className="panel-description">
            예상과 실제의 차이를 확인하고,
            다음 계획으로 개선점을 넘겨보세요.
          </p>
        </div>

        <span className="todo-count">
          {plan?.title ||
            '선택된 계획'}
        </span>
      </div>

      {loading ? (
        <div className="todo-empty">
          돌아보기 데이터를 불러오는 중...
        </div>
      ) : error ? (
        <div className="form-message error">
          ❌ {error}
        </div>
      ) : (
        <div className="review-content">

          {/* =========================
              SUMMARY
          ========================= */}

          <div className="review-summary">
            {[
              ['total', '전체 할 일'],
              ['completed', '완료'],
              ['overdue', '지연'],
              ['blocked', '막힘'],
            ].map(
              ([key, label]) => {
                const metric =
                  metricDefinitions[key]

                return (
                  <button
                    key={key}
                    type="button"
                    className={`review-stat review-stat-button ${
                      selectedMetric === key
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() =>
                      toggleMetric(key)
                    }
                  >
                    <span className="review-stat-label">
                      {label}
                    </span>

                    <strong>
                      {metric.count}개
                    </strong>

                    <span className="review-stat-hint">
                      {selectedMetric === key
                        ? '근거 닫기'
                        : '클릭하면 근거 보기'}
                    </span>
                  </button>
                )
              },
            )}

            <div className="review-stat">
              <span className="review-stat-label">
                예상 시간
              </span>

              <strong>
                {estimatedTotal}분
              </strong>
            </div>

            <div className="review-stat">
              <span className="review-stat-label">
                실제 시간
              </span>

              <strong>
                {actualTotal}분
              </strong>
            </div>

            <div className="review-stat">
              <span className="review-stat-label">
                시간 차이
              </span>

              <strong
                className={getDifferenceClass(
                  timeDifference,
                )}
              >
                {formatDifference(
                  timeDifference,
                )}
              </strong>
            </div>
          </div>

          {/* =========================
              EVIDENCE
          ========================= */}

          {selectedMetricData && (
            <div className="review-evidence">
              <div className="review-subheading">
                <div>
                  <strong>
                    🔎 {selectedMetricData.label} 근거 기록
                  </strong>

                  <span>
                    {selectedMetricData.count}개의
                    할 일이 해당 집계에 포함됩니다.
                  </span>
                </div>

                <button
                  type="button"
                  className="action-button"
                  onClick={() =>
                    setSelectedMetric(null)
                  }
                >
                  닫기
                </button>
              </div>

              {selectedMetricData.todos.length ===
              0 ? (
                <div className="review-evidence-empty">
                  해당하는 기록이 없습니다.
                </div>
              ) : (
                <div className="review-evidence-list">
                  {selectedMetricData.todos.map(
                    (todo) => {
                      const records =
                        executionMap[
                          todo.id
                        ] || []

                      const actualMinutes =
                        getTodoActualMinutes(
                          todo.id,
                        )

                      const latestRecord =
                        getLatestRecord(
                          todo.id,
                        )

                      return (
                        <button
                          type="button"
                          className="review-evidence-item"
                          key={todo.id}
                          onClick={() => {
                            document
                              .getElementById(
                                'todo-section',
                              )
                              ?.scrollIntoView({
                                behavior:
                                  'smooth',
                                block: 'start',
                              })
                          }}
                        >
                          <div className="review-evidence-item-top">
                            <div>
                              <span
                                className={`review-status ${
                                  todo.status ===
                                  'completed'
                                    ? 'completed'
                                    : ''
                                }`}
                              >
                                {todo.status ===
                                'completed'
                                  ? '완료'
                                  : '진행 중'}
                              </span>

                              <strong>
                                {todo.title}
                              </strong>
                            </div>

                            <span
                              className={getDifferenceClass(
                                actualMinutes -
                                  Number(
                                    todo.estimated_minutes ||
                                      0,
                                  ),
                              )}
                            >
                              {formatDifference(
                                actualMinutes -
                                  Number(
                                    todo.estimated_minutes ||
                                      0,
                                  ),
                              )}
                            </span>
                          </div>

                          <div className="review-evidence-meta">
                            <span>
                              마감{' '}
                              {todo.due_date ||
                                '없음'}
                            </span>

                            <span>
                              예상{' '}
                              {Number(
                                todo.estimated_minutes ||
                                  0,
                              )}
                              분
                            </span>

                            <span>
                              실제{' '}
                              {actualMinutes}분
                            </span>

                            <span>
                              실행{' '}
                              {records.length}회
                            </span>
                          </div>

                          {latestRecord && (
                            <div className="review-evidence-latest">
                              최근 실행{' '}
                              {formatDateTime(
                                latestRecord.started_at,
                              )}

                              {latestRecord.blocked_reason && (
                                <>
                                  {' · '}
                                  막힘:{' '}
                                  {
                                    latestRecord.blocked_reason
                                  }
                                </>
                              )}
                            </div>
                          )}

                          <span className="review-evidence-link">
                            할 일로 이동 →
                          </span>
                        </button>
                      )
                    },
                  )}
                </div>
              )}
            </div>
          )}

          {/* =========================
              PROGRESS
          ========================= */}

          <div className="review-progress">
            <div className="review-progress-head">
              <div>
                <strong>
                  계획 달성도
                </strong>

                <span>
                  완료 {completedTodos} /{' '}
                  {totalTodos}
                </span>
              </div>

              <strong>
                {completionRate}%
              </strong>
            </div>

            <div className="review-progress-track">
              <div
                className="review-progress-fill"
                style={{
                  width: `${completionRate}%`,
                }}
              />
            </div>
          </div>

          {/* =========================
              TIME COMPARISON
          ========================= */}

          <div className="review-time-panel">
            <div className="review-subheading">
              <div>
                <strong>
                  ⏱️ 계획 vs 실제
                </strong>

                <span>
                  모든 대상 할 일의 시간 합계를 비교합니다.
                </span>
              </div>
            </div>

            <div className="review-time-grid">
              <div>
                <span>
                  예상 시간
                </span>

                <strong>
                  {estimatedTotal}분
                </strong>
              </div>

              <div>
                <span>
                  실제 실행 시간
                </span>

                <strong>
                  {actualTotal}분
                </strong>
              </div>

              <div>
                <span>
                  차이
                </span>

                <strong
                  className={getDifferenceClass(
                    timeDifference,
                  )}
                >
                  {formatDifference(
                    timeDifference,
                  )}
                </strong>
              </div>
            </div>
          </div>

          {/* =========================
              TODO DETAIL
          ========================= */}

          <div className="review-todo-list">
            <div className="review-subheading">
              <div>
                <strong>
                  📋 할 일별 돌아보기
                </strong>

                <span>
                  예상 시간과 실제 실행 시간을 비교합니다.
                </span>
              </div>
            </div>

            {todos.length === 0 ? (
              <div className="todo-empty">
                <span>📝</span>

                <strong>
                  아직 할 일이 없습니다.
                </strong>

                <p>
                  할 일을 추가하면 돌아보기 결과가 표시됩니다.
                </p>
              </div>
            ) : (
              <div className="review-items">
                {todos.map((todo) => {
                  const records =
                    executionMap[
                      todo.id
                    ] || []

                  const actualMinutes =
                    getTodoActualMinutes(
                      todo.id,
                    )

                  const estimatedMinutes =
                    Number(
                      todo.estimated_minutes ||
                        0,
                    )

                  const difference =
                    actualMinutes -
                    estimatedMinutes

                  const completed =
                    todo.status ===
                    'completed'

                  const latestRecord =
                    records[0]

                  return (
                    <article
                      className="review-item"
                      key={todo.id}
                    >
                      <div className="review-item-head">
                        <div>
                          <span
                            className={
                              completed
                                ? 'review-status completed'
                                : 'review-status'
                            }
                          >
                            {completed
                              ? '완료'
                              : '진행 중'}
                          </span>

                          <h3>
                            {todo.title}
                          </h3>
                        </div>

                        <div
                          className={`review-difference ${getDifferenceClass(
                            difference,
                          )}`}
                        >
                          {formatDifference(
                            difference,
                          )}
                        </div>
                      </div>

                      <div className="review-item-grid">
                        <div>
                          <span>
                            예상 시간
                          </span>

                          <strong>
                            {estimatedMinutes}분
                          </strong>
                        </div>

                        <div>
                          <span>
                            실제 시간
                          </span>

                          <strong>
                            {actualMinutes}분
                          </strong>
                        </div>

                        <div>
                          <span>
                            마지막 실행
                          </span>

                          <strong>
                            {latestRecord
                              ? formatDateTime(
                                  latestRecord.started_at,
                                )
                              : '기록 없음'}
                          </strong>
                        </div>
                      </div>

                      {latestRecord && (
                        <div className="review-latest">
                          <span>
                            최근 실행
                          </span>

                          <div>
                            <span>
                              시작{' '}
                              {formatDateTime(
                                latestRecord.started_at,
                              )}
                            </span>

                            <span>
                              종료{' '}
                              {formatDateTime(
                                latestRecord.ended_at,
                              )}
                            </span>

                            <span>
                              실제{' '}
                              {
                                latestRecord.actual_minutes
                              }
                              분
                            </span>
                          </div>

                          {latestRecord.blocked_reason && (
                            <p>
                              막힌 이유:{' '}
                              {
                                latestRecord.blocked_reason
                              }
                            </p>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          {/* =========================
              NEXT PLAN
          ========================= */}

          <div className="review-next-plan">
            <div className="review-subheading">
              <div>
                <strong>
                  🧭 다음 계획으로 넘기기
                </strong>

                <span>
                  이번 계획에서 발견한 고칠 점 한 건을 다음 계획의 성공 기준으로 넘깁니다.
                </span>
              </div>
            </div>

            <textarea
              value={improvement}
              onChange={(event) =>
                setImprovement(
                  event.target.value,
                )
              }
              rows="3"
              placeholder="예: 예상 시간을 실제 작업 시간보다 30분 짧게 잡았다."
              disabled={creatingNextPlan}
            />

            <div className="review-next-plan-bottom">
              {nextPlanMessage && (
                <span className="review-next-plan-message">
                  {nextPlanMessage}
                </span>
              )}

              <button
                type="button"
                className="action-button primary"
                onClick={createNextPlan}
                disabled={
                  creatingNextPlan ||
                  !improvement.trim()
                }
              >
                {creatingNextPlan
                  ? '다음 계획 생성 중...'
                  : '↗ 다음 계획으로 넘기기'}
              </button>
            </div>
          </div>

          <div className="review-footer-note">
            <strong>
              💡 돌아보기 기준
            </strong>

            <span>
              지연은 서울 시간 기준 오늘보다 이전인
              미완료 할 일만 계산하며, 완료된 할 일은
              지연에 포함하지 않습니다.
            </span>
          </div>
        </div>
      )}
    </section>
  )
}

export default ReviewSection