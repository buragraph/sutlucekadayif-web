import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

export function ThemeSwitcher() {
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'light';
        }
        return 'light';
    });

    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggleTheme}>
                    {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                    <span className="sr-only">Tema değiştir</span>
                </Button>
            </TooltipTrigger>
            <TooltipContent>
                {theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
            </TooltipContent>
        </Tooltip>
    );
}
