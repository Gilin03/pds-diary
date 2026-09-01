import {
    useEffect,
    useMemo,
    useState,
} from 'react'
import { supabase } from '../lib/supabase'

const priorityLabels = {
    high: '높음',
    medium: '보통',
    low: '낮음',
}

const emptyForm = {
    title: '',
    due_date: '',
    priority: 'medium',
    tag: '',
    estimated_minutes: '',
}

const emptyExecutionForm = {
    started_at: '',
    ended_at: '',
    blocked_reason: '',
}

function formatDateTimeLocal(value) {
    if (!value) return ''

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return ''
    }

    const pad = (number) =>
        String(number).padStart(2, '0')

    return `${date.getFullYear()}-${pad(
        date.getMonth() + 1,
    )}-${pad(date.getDate())}T${pad(
        date.getHours(),
    )}:${pad(date.getMinutes())}`
}

function toIsoString(value) {
    if (!value) return null

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return null
    }

    return date.toISOString()
}

function calculateActualMinutes(
    startedAt,
    endedAt,
) {
    const start = new Date(startedAt)
    const end = new Date(endedAt)

    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
    ) {
        return 0
    }

    const difference =
        Math.round(
            (end.getTime() -
                start.getTime()) /
                60000,
        )

    return Math.max(0, difference)
}

function TodoSection({ planId }) {
    const [todos, setTodos] = useState([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const [message, setMessage] = useState('')
    const [error, setError] = useState('')

    const [form, setForm] =
        useState(emptyForm)

    const [editingId, setEditingId] =
        useState(null)

    const [editForm, setEditForm] =
        useState(emptyForm)

    const [search, setSearch] =
        useState('')

    const [statusFilter, setStatusFilter] =
        useState('all')

    const [priorityFilter, setPriorityFilter] =
        useState('all')

    const [tagFilter, setTagFilter] =
        useState('all')

    const [sortBy, setSortBy] =
        useState('due_date')

    /*
     * 완료 기록 상태
     *
     * todo_id가 todo_completions의 PK이므로
     * 하나의 할 일에는 하나의 완료 기록만 존재한다.
     */
    const [completionMap, setCompletionMap] =
        useState({})

    /*
     * 실행 기록 상태
     */
    const [executionRecords, setExecutionRecords] =
        useState({})

    const [executionTodoId, setExecutionTodoId] =
        useState(null)

    const [executionForm, setExecutionForm] =
        useState(emptyExecutionForm)

    const [activeExecutionId, setActiveExecutionId] =
        useState(null)

    useEffect(() => {
        if (planId) {
            loadTodos()
        } else {
            setTodos([])
            setCompletionMap({})
            setExecutionRecords({})
            setLoading(false)
        }
    }, [planId])

    async function loadTodos() {
        setLoading(true)
        setError('')

        const { data, error } =
            await supabase
                .from('todos')
                .select('*')
                .eq('plan_id', planId)
                .order('created_at', {
                    ascending: true,
                })

        if (error) {
            setError(error.message)
            setLoading(false)
            return
        }

        const loadedTodos = data || []

        setTodos(loadedTodos)

        await Promise.all([
            loadCompletions(
                loadedTodos,
            ),
            loadExecutions(
                loadedTodos,
            ),
        ])

        setLoading(false)
    }

    async function loadCompletions(
        todoList,
    ) {
        if (todoList.length === 0) {
            setCompletionMap({})
            return
        }

        const todoIds =
            todoList.map(
                (todo) => todo.id,
            )

        const { data, error } =
            await supabase
                .from('todo_completions')
                .select(
                    'todo_id, completed_at',
                )
                .in(
                    'todo_id',
                    todoIds,
                )

        if (error) {
            setError(
                `완료 기록을 불러오지 못했습니다: ${error.message}`,
            )
            return
        }

        const nextMap = {}

        ;(data || []).forEach(
            (completion) => {
                nextMap[
                    completion.todo_id
                ] = completion
            },
        )

        setCompletionMap(nextMap)
    }

    async function loadExecutions(
        todoList,
    ) {
        if (todoList.length === 0) {
            setExecutionRecords({})
            return
        }

        const todoIds =
            todoList.map(
                (todo) => todo.id,
            )

        const { data, error } =
            await supabase
                .from('execution_records')
                .select('*')
                .in(
                    'todo_id',
                    todoIds,
                )
                .order('created_at', {
                    ascending: false,
                })

        if (error) {
            setError(
                `실행 기록을 불러오지 못했습니다: ${error.message}`,
            )
            return
        }

        const grouped = {}

        ;(data || []).forEach(
            (record) => {
                if (
                    !grouped[
                        record.todo_id
                    ]
                ) {
                    grouped[
                        record.todo_id
                    ] = []
                }

                grouped[
                    record.todo_id
                ].push(record)
            },
        )

        setExecutionRecords(grouped)
    }

    function handleChange(event) {
        const {
            name,
            value,
        } = event.target

        setForm((previous) => ({
            ...previous,
            [name]: value,
        }))
    }

    function handleEditChange(
        event,
    ) {
        const {
            name,
            value,
        } = event.target

        setEditForm((previous) => ({
            ...previous,
            [name]: value,
        }))
    }

    function handleExecutionChange(
        event,
    ) {
        const {
            name,
            value,
        } = event.target

        setExecutionForm(
            (previous) => ({
                ...previous,
                [name]: value,
            }),
        )
    }

    function validate(values) {
        if (!values.title.trim()) {
            return '할 일 내용을 입력해주세요.'
        }

        if (
            values.estimated_minutes !==
            ''
        ) {
            const minutes = Number(
                values.estimated_minutes,
            )

            if (
                !Number.isInteger(
                    minutes,
                ) ||
                minutes < 0
            ) {
                return '예상 시간은 0 이상의 정수로 입력해주세요.'
            }
        }

        return null
    }

    function validateExecution(
        values,
    ) {
        if (!values.started_at) {
            return '시작 시각을 입력해주세요.'
        }

        if (!values.ended_at) {
            return '끝난 시각을 입력해주세요.'
        }

        const startedAt =
            new Date(values.started_at)

        const endedAt =
            new Date(values.ended_at)

        if (
            Number.isNaN(
                startedAt.getTime(),
            ) ||
            Number.isNaN(
                endedAt.getTime(),
            )
        ) {
            return '시작 시각과 끝난 시각을 확인해주세요.'
        }

        if (endedAt < startedAt) {
            return '끝난 시각은 시작 시각보다 빠를 수 없습니다.'
        }

        return null
    }

    async function createTodo(event) {
        event.preventDefault()

        if (saving) return

        setError('')
        setMessage('')

        const validationError =
            validate(form)

        if (validationError) {
            setError(validationError)
            return
        }

        setSaving(true)

        try {
            const {
                data,
                error,
            } = await supabase
                .from('todos')
                .insert({
                    plan_id: planId,
                    title:
                        form.title.trim(),
                    due_date:
                        form.due_date ||
                        null,
                    priority:
                        form.priority,
                    tag:
                        form.tag.trim() ||
                        null,
                    estimated_minutes:
                        form.estimated_minutes ===
                        ''
                            ? 0
                            : Number(
                                  form.estimated_minutes,
                              ),
                    status:
                        'in_progress',
                })
                .select()
                .single()

            if (error) {
                throw new Error(
                    error.message,
                )
            }

            setTodos(
                (previous) => [
                    ...previous,
                    data,
                ],
            )

            setForm(emptyForm)

            setMessage(
                '할 일이 저장되었습니다.',
            )
        } catch (caughtError) {
            setError(
                caughtError.message,
            )
        } finally {
            setSaving(false)
        }
    }

    function startEditing(todo) {
        setEditingId(todo.id)

        setEditForm({
            title: todo.title,
            due_date:
                todo.due_date || '',
            priority: todo.priority,
            tag: todo.tag || '',
            estimated_minutes:
                String(
                    todo.estimated_minutes ??
                        0,
                ),
        })

        setError('')
        setMessage('')
    }

    function cancelEditing() {
        setEditingId(null)
        setEditForm(emptyForm)
        setError('')
    }

    async function saveEdit(
        event,
        todo,
    ) {
        event.preventDefault()

        if (saving) return

        setError('')
        setMessage('')

        const validationError =
            validate(editForm)

        if (validationError) {
            setError(validationError)
            return
        }

        setSaving(true)

        try {
            const {
                data,
                error,
            } = await supabase
                .from('todos')
                .update({
                    title:
                        editForm.title.trim(),
                    due_date:
                        editForm.due_date ||
                        null,
                    priority:
                        editForm.priority,
                    tag:
                        editForm.tag.trim() ||
                        null,
                    estimated_minutes:
                        editForm.estimated_minutes ===
                        ''
                            ? 0
                            : Number(
                                  editForm.estimated_minutes,
                              ),
                    updated_at:
                        new Date().toISOString(),
                })
                .eq(
                    'id',
                    todo.id,
                )
                .select()
                .single()

            if (error) {
                throw new Error(
                    error.message,
                )
            }

            setTodos(
                (previous) =>
                    previous.map(
                        (item) =>
                            item.id ===
                            data.id
                                ? data
                                : item,
                    ),
            )
            

            setEditingId(null)
            setEditForm(emptyForm)

            setMessage(
                '할 일이 수정되었습니다.',
            )
        } catch (caughtError) {
            setError(
                caughtError.message,
            )
        } finally {
            setSaving(false)
        }
    }

    /*
     * C21 / C22
     *
     * 완료 처리:
     * 1. todos.status = completed
     * 2. todo_completions에 완료 기록 upsert
     *
     * todo_completions.todo_id가 PK이므로
     * 같은 할 일의 완료 기록은 한 건만 존재한다.
     */
    async function toggleComplete(
        todo,
    ) {
        if (saving) return

        setError('')
        setMessage('')
        setSaving(true)

        const nextStatus =
            todo.status ===
            'completed'
                ? 'in_progress'
                : 'completed'

        try {
            if (
                nextStatus ===
                'completed'
            ) {
                const completedAt =
                    new Date().toISOString()

                const {
                    error:
                        completionError,
                } =
                    await supabase
                        .from(
                            'todo_completions',
                        )
                        .upsert(
                            {
                                todo_id:
                                    todo.id,
                                completed_at:
                                    completedAt,
                            },
                            {
                                onConflict:
                                    'todo_id',
                            },
                        )

                if (
                    completionError
                ) {
                    throw new Error(
                        `완료 기록을 저장하지 못했습니다: ${completionError.message}`,
                    )
                }

                setCompletionMap(
                    (previous) => ({
                        ...previous,
                        [todo.id]: {
                            todo_id:
                                todo.id,
                            completed_at:
                                completedAt,
                        },
                    }),
                )
            } else {
                const {
                    error:
                        completionDeleteError,
                } =
                    await supabase
                        .from(
                            'todo_completions',
                        )
                        .delete()
                        .eq(
                            'todo_id',
                            todo.id,
                        )

                if (
                    completionDeleteError
                ) {
                    throw new Error(
                        `완료 기록을 되돌리지 못했습니다: ${completionDeleteError.message}`,
                    )
                }

                setCompletionMap(
                    (previous) => {
                        const next = {
                            ...previous,
                        }

                        delete next[
                            todo.id
                        ]

                        return next
                    },
                )
            }

            const {
                data,
                error,
            } = await supabase
                .from('todos')
                .update({
                    status: nextStatus,
                    updated_at:
                        new Date().toISOString(),
                })
                .eq(
                    'id',
                    todo.id,
                )
                .select()
                .single()

            if (error) {
                throw new Error(
                    error.message,
                )
            }

            setTodos(
                (previous) =>
                    previous.map(
                        (item) =>
                            item.id ===
                            data.id
                                ? data
                                : item,
                    ),
            )

            window.dispatchEvent(
  new CustomEvent('todo-completion-changed', {
    detail: {
      todoId: todo.id,
      completed:
        nextStatus === 'completed',
    },
  }),
)

            setMessage(
                nextStatus ===
                    'completed'
                    ? '할 일을 완료 처리했습니다.'
                    : '할 일을 다시 진행 중으로 되돌렸습니다.',
            )
        } catch (caughtError) {
            setError(
                caughtError.message,
            )
        } finally {
            setSaving(false)
        }
    }

    async function deleteTodo(
        todo,
    ) {
        const confirmed =
            window.confirm(
                `"${todo.title}" 할 일을 삭제할까요?`,
            )

        if (!confirmed) return
        if (saving) return

        setError('')
        setMessage('')
        setSaving(true)

        try {
            /*
             * 완료 기록이 있다면 먼저 제거.
             * todo_completions는 todo_id가 PK이므로
             * 이 할 일의 완료 기록은 최대 1건이다.
             */
            const {
                error:
                    completionError,
            } =
                await supabase
                    .from(
                        'todo_completions',
                    )
                    .delete()
                    .eq(
                        'todo_id',
                        todo.id,
                    )

            if (
                completionError
            ) {
                throw new Error(
                    `완료 기록을 삭제하지 못했습니다: ${completionError.message}`,
                )
            }

            /*
             * 실행 기록 삭제.
             */
            const {
                error:
                    executionError,
            } =
                await supabase
                    .from(
                        'execution_records',
                    )
                    .delete()
                    .eq(
                        'todo_id',
                        todo.id,
                    )

            if (
                executionError
            ) {
                throw new Error(
                    `실행 기록을 삭제하지 못했습니다: ${executionError.message}`,
                )
            }

            const {
                error,
            } = await supabase
                .from('todos')
                .delete()
                .eq(
                    'id',
                    todo.id,
                )

            if (error) {
                throw new Error(
                    error.message,
                )
            }

            setTodos(
                (previous) =>
                    previous.filter(
                        (item) =>
                            item.id !==
                            todo.id,
                    ),
            )

            setCompletionMap(
                (previous) => {
                    const next = {
                        ...previous,
                    }

                    delete next[
                        todo.id
                    ]

                    return next
                },
            )

            setExecutionRecords(
                (previous) => {
                    const next = {
                        ...previous,
                    }

                    delete next[
                        todo.id
                    ]

                    return next
                },
            )

            setMessage(
                '할 일이 삭제되었습니다.',
            )
        } catch (caughtError) {
            setError(
                caughtError.message,
            )
        } finally {
            setSaving(false)
        }
    }

    /*
     * 실행 기록 패널 열기
     */
    function openExecution(
        todo,
    ) {
        setError('')
        setMessage('')

        setExecutionTodoId(
            todo.id,
        )

        const records =
            executionRecords[
                todo.id
            ] || []

        /*
         * 아직 종료되지 않은 기록이 있으면
         * 그 기록을 계속 편집한다.
         */
        const activeRecord =
            records.find(
                (record) =>
                    !record.ended_at,
            )

        if (activeRecord) {
            setActiveExecutionId(
                activeRecord.id,
            )

            setExecutionForm({
                started_at:
                    formatDateTimeLocal(
                        activeRecord.started_at,
                    ),
                ended_at:
                    activeRecord.ended_at
                        ? formatDateTimeLocal(
                              activeRecord.ended_at,
                          )
                        : '',
                blocked_reason:
                    activeRecord.blocked_reason ||
                    '',
            })

            return
        }

        setActiveExecutionId(null)

        setExecutionForm({
            started_at:
                formatDateTimeLocal(
                    new Date(),
                ),
            ended_at: '',
            blocked_reason: '',
        })
    }

    function closeExecution() {
        setExecutionTodoId(null)
        setActiveExecutionId(null)
        setExecutionForm(
            emptyExecutionForm,
        )
    }

    /*
     * 실행 시작
     *
     * C23:
     * started_at 저장
     *
     * 실행 시작 시 execution_records에
     * 시작 시각만 먼저 저장한다.
     */
    async function startExecution(
        todo,
    ) {
        if (saving) return

        setError('')
        setMessage('')

        const startedAt =
            executionForm.started_at ||
            formatDateTimeLocal(
                new Date(),
            )

        setSaving(true)

        try {
            const {
                data,
                error,
            } = await supabase
                .from(
                    'execution_records',
                )
                .insert({
                    todo_id:
                        todo.id,
                    started_at:
                        toIsoString(
                            startedAt,
                        ),
                    ended_at: null,
                    actual_minutes: 0,
                    blocked_reason:
                        null,
                })
                .select()
                .single()

            if (error) {
                throw new Error(
                    `실행 기록을 시작하지 못했습니다: ${error.message}`,
                )
            }

            setExecutionRecords(
                (previous) => ({
                    ...previous,
                    [todo.id]: [
                        data,
                        ...(previous[
                            todo.id
                        ] || []),
                    ],
                }),
            )

            setActiveExecutionId(
                data.id,
            )

            setExecutionForm(
                (previous) => ({
                    ...previous,
                    started_at:
                        formatDateTimeLocal(
                            data.started_at,
                        ),
                }),
            )

            window.dispatchEvent(
    new CustomEvent(
        'execution-record-changed',
    ),
)

            setMessage(
                '실행 시작 시각이 저장되었습니다.',
            )
        } catch (caughtError) {
            setError(
                caughtError.message,
            )
        } finally {
            setSaving(false)
        }
    }

    /*
     * 실행 종료
     *
     * C24:
     * ended_at 저장
     *
     * C25:
     * 실제 걸린 시간을 계산해서 저장
     *
     * C26:
     * blocked_reason 저장
     */
    async function finishExecution(
        todo,
    ) {
        if (saving) return

        const validationError =
            validateExecution(
                executionForm,
            )

        if (validationError) {
            setError(validationError)
            return
        }

        if (!activeExecutionId) {
            setError(
                '먼저 실행 시작을 눌러주세요.',
            )
            return
        }

        const actualMinutes =
            calculateActualMinutes(
                executionForm.started_at,
                executionForm.ended_at,
            )

        setError('')
        setMessage('')
        setSaving(true)

        try {
            const endedAt =
                toIsoString(
                    executionForm.ended_at,
                )

            const {
                data,
                error,
            } = await supabase
                .from(
                    'execution_records',
                )
                .update({
                    ended_at:
                        endedAt,
                    actual_minutes:
                        actualMinutes,
                    blocked_reason:
                        executionForm.blocked_reason.trim() ||
                        null,
                })
                .eq(
                    'id',
                    activeExecutionId,
                )
                .select()
                .single()

            if (error) {
                throw new Error(
                    `실행 기록을 저장하지 못했습니다: ${error.message}`,
                )
            }

            setExecutionRecords(
                (previous) => ({
                    ...previous,
                    [todo.id]: (
                        previous[
                            todo.id
                        ] || []
                    ).map(
                        (record) =>
                            record.id ===
                            data.id
                                ? data
                                : record,
                    ),
                }),
            )

            setActiveExecutionId(null)

            window.dispatchEvent(
    new CustomEvent(
        'execution-record-changed',
    ),
)

            setExecutionForm(
                emptyExecutionForm,
            )

            setMessage(
                `실행 기록이 저장되었습니다. 실제 시간 ${actualMinutes}분`,
            )
        } catch (caughtError) {
            setError(
                caughtError.message,
            )
        } finally {
            setSaving(false)
        }
    }

    const availableTags =
        useMemo(() => {
            const tags = todos
                .map((todo) =>
                    todo.tag?.trim(),
                )
                .filter(Boolean)

            return [
                ...new Set(tags),
            ].sort((a, b) =>
                a.localeCompare(
                    b,
                    'ko',
                ),
            )
        }, [todos])

    const filteredTodos =
        useMemo(() => {
            const keyword =
                search
                    .trim()
                    .toLowerCase()

            const result =
                todos.filter(
                    (todo) => {
                        const matchesSearch =
                            !keyword ||
                            todo.title
                                .toLowerCase()
                                .includes(
                                    keyword,
                                ) ||
                            (
                                todo.tag ||
                                ''
                            )
                                .toLowerCase()
                                .includes(
                                    keyword,
                                )

                        const matchesStatus =
                            statusFilter ===
                                'all' ||
                            todo.status ===
                                statusFilter

                        const matchesPriority =
                            priorityFilter ===
                                'all' ||
                            todo.priority ===
                                priorityFilter

                        const matchesTag =
                            tagFilter ===
                                'all' ||
                            (
                                todo.tag ||
                                ''
                            ) ===
                                tagFilter

                        return (
                            matchesSearch &&
                            matchesStatus &&
                            matchesPriority &&
                            matchesTag
                        )
                    },
                )

            return [
                ...result,
            ].sort(
                (a, b) => {
                    if (
                        sortBy ===
                        'due_date'
                    ) {
                        const aDate =
                            a.due_date ||
                            '9999-12-31'

                        const bDate =
                            b.due_date ||
                            '9999-12-31'

                        const dateCompare =
                            aDate.localeCompare(
                                bDate,
                            )

                        if (
                            dateCompare !==
                            0
                        ) {
                            return dateCompare
                        }
                    }

                    if (
                        sortBy ===
                        'priority'
                    ) {
                        const rank = {
                            high: 0,
                            medium: 1,
                            low: 2,
                        }

                        const priorityCompare =
                            rank[
                                a.priority
                            ] -
                            rank[
                                b.priority
                            ]

                        if (
                            priorityCompare !==
                            0
                        ) {
                            return priorityCompare
                        }
                    }

                    if (
                        sortBy ===
                        'created_at'
                    ) {
                        const createdCompare =
                            a.created_at.localeCompare(
                                b.created_at,
                            )

                        if (
                            createdCompare !==
                            0
                        ) {
                            return createdCompare
                        }
                    }

                    return a.created_at.localeCompare(
                        b.created_at,
                    )
                },
            )
        }, [
            todos,
            search,
            statusFilter,
            priorityFilter,
            tagFilter,
            sortBy,
        ])

    if (!planId) {
        return null
    }

    return (
        <section className="todo-section panel">
            <div className="panel-header">
                <div>
                    <h2 className="panel-title">
                        ✅ 할 일
                    </h2>

                    <p className="panel-description">
                        선택된 계획에 딸린 실제 할 일을 관리합니다.
                    </p>
                </div>

                <span className="todo-count">
                    {todos.length}개
                </span>
            </div>

            <div className="todo-content">
                {/* =========================
                    CREATE TODO
                ========================= */}

                <form
                    className="todo-create-form"
                    onSubmit={createTodo}
                >
                    <label className="form-label">
                        할 일

                        <input
                            name="title"
                            value={
                                form.title
                            }
                            onChange={
                                handleChange
                            }
                            placeholder="예: DB 테이블 관계 정리"
                        />
                    </label>

                    <div className="form-row">
                        <label className="form-label">
                            마감일

                            <input
                                type="date"
                                name="due_date"
                                value={
                                    form.due_date
                                }
                                onChange={
                                    handleChange
                                }
                            />
                        </label>

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
                    </div>

                    <div className="form-row">
                        <label className="form-label">
                            태그

                            <input
                                name="tag"
                                value={
                                    form.tag
                                }
                                onChange={
                                    handleChange
                                }
                                placeholder="예: DB"
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
                                    min="0"
                                    placeholder="예: 60"
                                />

                                <span>
                                    분
                                </span>
                            </div>
                        </label>
                    </div>

                    <button
                        className="submit-button"
                        type="submit"
                        disabled={saving}
                    >
                        {saving
                            ? '저장 중...'
                            : '+ 할 일 추가'}
                    </button>
                </form>

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

                {/* =========================
                    SEARCH / FILTER / SORT
                ========================= */}

                <div className="todo-controls">
                    <div className="todo-search">
                        <span>🔎</span>

                        <input
                            type="search"
                            value={
                                search
                            }
                            onChange={(
                                event,
                            ) =>
                                setSearch(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            placeholder="할 일 또는 태그 검색"
                        />
                    </div>

                    <div className="todo-filters">
                        <select
                            value={
                                statusFilter
                            }
                            onChange={(
                                event,
                            ) =>
                                setStatusFilter(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            aria-label="상태 필터"
                        >
                            <option value="all">
                                상태: 전체
                            </option>

                            <option value="in_progress">
                                진행 중
                            </option>

                            <option value="completed">
                                완료
                            </option>
                        </select>

                        <select
                            value={
                                priorityFilter
                            }
                            onChange={(
                                event,
                            ) =>
                                setPriorityFilter(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            aria-label="우선순위 필터"
                        >
                            <option value="all">
                                우선순위: 전체
                            </option>

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

                        <select
                            value={
                                tagFilter
                            }
                            onChange={(
                                event,
                            ) =>
                                setTagFilter(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            aria-label="태그 필터"
                        >
                            <option value="all">
                                태그: 전체
                            </option>

                            {availableTags.map(
                                (tag) => (
                                    <option
                                        key={
                                            tag
                                        }
                                        value={
                                            tag
                                        }
                                    >
                                        태그: {tag}
                                    </option>
                                ),
                            )}
                        </select>

                        <select
                            value={
                                sortBy
                            }
                            onChange={(
                                event,
                            ) =>
                                setSortBy(
                                    event
                                        .target
                                        .value,
                                )
                            }
                            aria-label="정렬 기준"
                        >
                            <option value="due_date">
                                마감일 ↑
                            </option>

                            <option value="priority">
                                우선순위 ↑
                            </option>

                            <option value="created_at">
                                생성일 ↑
                            </option>
                        </select>
                    </div>
                </div>

                <div className="todo-list-heading">
                    <div>
                        <strong>
                            현재 할 일
                        </strong>

                        <span>
                            현재 정렬:{' '}
                            {sortBy ===
                            'due_date'
                                ? '마감일 오름차순'
                                : sortBy ===
                                    'priority'
                                  ? '우선순위 오름차순'
                                  : '생성일 오름차순'}
                        </span>
                    </div>
                </div>

                {/* =========================
                    TODO LIST
                ========================= */}

                {loading ? (
                    <div className="todo-empty">
                        할 일을 불러오는 중...
                    </div>
                ) : todos.length ===
                  0 ? (
                    <div className="todo-empty">
                        <span>📝</span>

                        <strong>
                            아직 할 일이 없습니다.
                        </strong>

                        <p>
                            위에서 첫 번째 할 일을 추가해보세요.
                        </p>
                    </div>
                ) : filteredTodos.length ===
                  0 ? (
                    <div className="todo-empty">
                        <span>🔎</span>

                        <strong>
                            조건에 맞는 할 일이 없습니다.
                        </strong>

                        <p>
                            검색어나 필터 조건을 바꿔보세요.
                        </p>
                    </div>
                ) : (
                    <div className="todo-list">
                        {filteredTodos.map(
                            (todo) => {
                                const completed =
                                    todo.status ===
                                    'completed'

                                const editing =
                                    editingId ===
                                    todo.id

                                const records =
                                    executionRecords[
                                        todo.id
                                    ] || []

                                const latestRecord =
                                    records[0]

                                if (editing) {
                                    return (
                                        <form
                                            key={
                                                todo.id
                                            }
                                            className="todo-card editing"
                                            onSubmit={(
                                                event,
                                            ) =>
                                                saveEdit(
                                                    event,
                                                    todo,
                                                )
                                            }
                                        >
                                            <div className="todo-edit-title">
                                                ✏️ 할 일 수정
                                            </div>

                                            <label className="form-label">
                                                할 일

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
                                                    마감일

                                                    <input
                                                        type="date"
                                                        name="due_date"
                                                        value={
                                                            editForm.due_date
                                                        }
                                                        onChange={
                                                            handleEditChange
                                                        }
                                                    />
                                                </label>

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
                                            </div>

                                            <div className="form-row">
                                                <label className="form-label">
                                                    태그

                                                    <input
                                                        name="tag"
                                                        value={
                                                            editForm.tag
                                                        }
                                                        onChange={
                                                            handleEditChange
                                                        }
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
                                                            min="0"
                                                        />

                                                        <span>
                                                            분
                                                        </span>
                                                    </div>
                                                </label>
                                            </div>

                                            <div className="todo-actions">
                                                <button
                                                    className="action-button primary"
                                                    type="submit"
                                                    disabled={
                                                        saving
                                                    }
                                                >
                                                    💾 저장
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
                                    )
                                }

                                return (
                                   <article
  key={todo.id}
  className={`todo-card ${completed ? 'completed' : ''}`}
>
  <div className="todo-main">
    <button
      type="button"
      className="todo-check"
      onClick={() => toggleComplete(todo)}
      disabled={saving}
      aria-label={
        completed
          ? '진행 중으로 되돌리기'
          : '완료 처리'
      }
    >
      {completed ? '✓' : ''}
    </button>

    <div className="todo-details">
      <div className="todo-title-row">
        <h3>{todo.title}</h3>

        <span
          className={`todo-priority ${todo.priority}`}
        >
          {priorityLabels[todo.priority]}
        </span>
      </div>

      <div className="todo-meta">
        <span>
          📅 {todo.due_date || '마감일 없음'}
        </span>

        <span>
          🏷️ {todo.tag || '태그 없음'}
        </span>

        <span>
          ⏱️ {todo.estimated_minutes}분
        </span>
      </div>
    </div>
  </div>

  {/* 최근 실행 기록 요약 */}
  {latestRecord && (
    <div className="execution-summary">
      <div className="execution-summary-head">
        <span className="execution-summary-label">
          ▶ 최근 실행
        </span>

        <span className="execution-summary-count">
          {records.length}회
        </span>
      </div>

      <div className="execution-summary-body">
        <div>
          <span>실제 시간</span>
          <strong>
            {latestRecord.actual_minutes}분
          </strong>
        </div>

        <div>
          <span>시작</span>
          <strong>
            {latestRecord.started_at
              ? new Date(
                  latestRecord.started_at,
                ).toLocaleString('ko-KR')
              : '-'}
          </strong>
        </div>

        <div>
          <span>종료</span>
          <strong>
            {latestRecord.ended_at
              ? new Date(
                  latestRecord.ended_at,
                ).toLocaleString('ko-KR')
              : '진행 중'}
          </strong>
        </div>

        <div>
          <span>막힘</span>
          <strong>
            {latestRecord.blocked_reason ||
              '없음'}
          </strong>
        </div>
      </div>
    </div>
  )}

  {/* 기본 버튼 */}
  <div className="todo-actions">
    <button
      type="button"
      className="action-button"
      onClick={() => startEditing(todo)}
      disabled={saving}
    >
      ✏️ 수정
    </button>

    <button
      type="button"
      className="action-button execution-button"
      onClick={() => openExecution(todo)}
      disabled={saving}
    >
      ▶ 실행 기록
    </button>

    <button
      type="button"
      className="action-button danger"
      onClick={() => deleteTodo(todo)}
      disabled={saving}
    >
      🗑 삭제
    </button>
  </div>

  {/* 실행 기록 상세 - 버튼 눌렀을 때만 표시 */}
  {executionTodoId === todo.id && (
    <div className="execution-panel">
      <div className="execution-panel-header">
        <div>
          <span className="execution-panel-kicker">
            EXECUTION
          </span>

          <h4>
            ▶ 실행 기록
          </h4>

          <p>
            {todo.title}
          </p>
        </div>

        <button
          type="button"
          className="action-button"
          onClick={closeExecution}
          disabled={saving}
        >
          닫기
        </button>
      </div>

      <div className="execution-fields">
        <label className="form-label">
          시작 시각

          <input
            type="datetime-local"
            name="started_at"
            value={
              executionForm.started_at
            }
            onChange={
              handleExecutionChange
            }
            disabled={
              Boolean(
                activeExecutionId,
              ) || saving
            }
          />
        </label>

        <label className="form-label">
          종료 시각

          <input
            type="datetime-local"
            name="ended_at"
            value={
              executionForm.ended_at
            }
            onChange={
              handleExecutionChange
            }
            disabled={
              !activeExecutionId ||
              saving
            }
          />
        </label>
      </div>

      <label className="form-label execution-reason">
        막혔던 이유

        <textarea
          name="blocked_reason"
          value={
            executionForm.blocked_reason
          }
          onChange={
            handleExecutionChange
          }
          rows="3"
          placeholder="막힌 부분이나 이유를 적어주세요."
          disabled={
            !activeExecutionId ||
            saving
          }
        />
      </label>

      <div className="execution-metrics">
        <div>
          <span>예상 시간</span>
          <strong>
            {todo.estimated_minutes}분
          </strong>
        </div>

        <div>
          <span>현재 실제 시간</span>
          <strong>
            {executionForm.started_at &&
            executionForm.ended_at
              ? calculateActualMinutes(
                  executionForm.started_at,
                  executionForm.ended_at,
                )
              : 0}
            분
          </strong>
        </div>
      </div>

      <div className="execution-panel-actions">
        {!activeExecutionId ? (
          <button
            type="button"
            className="action-button primary"
            onClick={() =>
              startExecution(todo)
            }
            disabled={saving}
          >
            ▶ 실행 시작
          </button>
        ) : (
          <button
            type="button"
            className="action-button primary"
            onClick={() =>
              finishExecution(todo)
            }
            disabled={saving}
          >
            ⏹ 실행 종료 및 저장
          </button>
        )}
      </div>
    </div>
  )}
</article>
                                )
                            },
                        )}
                    </div>
                )}

                <div className="todo-sort-note">
                    현재 정렬 기준:{' '}
                    <strong>
                        {sortBy ===
                        'due_date'
                            ? '마감일 오름차순 → 같은 날짜는 생성일 오름차순'
                            : sortBy ===
                                'priority'
                              ? '우선순위 오름차순 → 같은 우선순위는 생성일 오름차순'
                              : '생성일 오름차순'}
                    </strong>

                    <span>
                        {' '}
                        · 검색{' '}
                        {search
                            ? `"${search}"`
                            : '없음'}{' '}
                        · 표시{' '}
                        {
                            filteredTodos.length
                        }
                        개
                    </span>
                </div>
            </div>
        </section>
    )
}

export default TodoSection