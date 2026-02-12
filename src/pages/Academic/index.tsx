import {
    ArrowUpRight,
    Award,
    BarChart3,
    BookOpen,
    ClipboardList,
    Clock,
    FileText,
    TableProperties,
    TrendingUp,
    UserPlus
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '../../components/patterns/PageHeader'

interface HubCard {
    title: string
    description: string
    icon: React.ElementType
    links: { label: string; path: string }[]
}

const sections: HubCard[] = [
    {
        title: 'Curriculum',
        description: 'Manage subjects, teacher allocation, and CBC/JSS programs',
        icon: BookOpen,
        links: [
            { label: 'Subjects', path: '/academic/subjects' },
            { label: 'Teacher Allocation', path: '/academic/allocations' },
            { label: 'CBC Strands', path: '/academic/cbc-strands' },
            { label: 'JSS Transition', path: '/academic/jss-transition' }
        ]
    },
    {
        title: 'Examinations',
        description: 'Create exams, enter marks, and manage schedules',
        icon: ClipboardList,
        links: [
            { label: 'Exam Management', path: '/academic/exams' },
            { label: 'Marks Entry', path: '/academic/marks-entry' },
            { label: 'Exam Schedule', path: '/academic/schedule' }
        ]
    },
    {
        title: 'Report Cards',
        description: 'View and generate student report cards',
        icon: FileText,
        links: [
            { label: 'View Reports', path: '/report-cards' },
            { label: 'Generate Reports', path: '/academic/report-card-generation' }
        ]
    },
    {
        title: 'Analytics',
        description: 'Exam performance, merit lists, and improvement tracking',
        icon: BarChart3,
        links: [
            { label: 'Exam Analytics', path: '/academic/analytics/exams' },
            { label: 'Report Card Stats', path: '/academic/analytics/report-cards' },
            { label: 'Merit Lists', path: '/academic/merit-lists' },
            { label: 'Subject Merit', path: '/academic/analytics/subject-merit-list' },
            { label: 'Most Improved', path: '/academic/analytics/most-improved' }
        ]
    },
    {
        title: 'Recognition',
        description: 'Student awards and certificates of achievement',
        icon: Award,
        links: [
            { label: 'Awards Management', path: '/academic/awards' }
        ]
    }
]

const iconMap: Record<string, React.ElementType> = {
    'Subjects': BookOpen,
    'Teacher Allocation': UserPlus,
    'CBC Strands': BookOpen,
    'JSS Transition': ArrowUpRight,
    'Exam Management': ClipboardList,
    'Marks Entry': ClipboardList,
    'Exam Schedule': Clock,
    'View Reports': FileText,
    'Generate Reports': FileText,
    'Exam Analytics': BarChart3,
    'Report Card Stats': BarChart3,
    'Merit Lists': ClipboardList,
    'Subject Merit': TableProperties,
    'Most Improved': TrendingUp,
    'Awards Management': Award
}

export default function AcademicsHub() {
    const navigate = useNavigate()

    return (
        <div className="space-y-8">
            <PageHeader
                title="Academics"
                subtitle="Curriculum, examinations, report cards, and academic analytics"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sections.map((section) => (
                    <div
                        key={section.title}
                        className="premium-card group overflow-hidden"
                    >
                        <div className="p-6 border-b border-border/40 bg-secondary/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <section.icon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground tracking-tight">{section.title}</h3>
                                    <p className="text-xs text-foreground/50">{section.description}</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 space-y-1">
                            {section.links.map((link) => {
                                const LinkIcon = iconMap[link.label] || FileText
                                return (
                                    <button
                                        key={link.path}
                                        onClick={() => navigate(link.path)}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors text-left"
                                    >
                                        <LinkIcon className="w-4 h-4 opacity-60" />
                                        <span className="font-medium">{link.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
