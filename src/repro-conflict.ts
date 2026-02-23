export interface TestProps {
    label?: string | undefined
}

export const testFn = (val: string | undefined) => {
    const props: TestProps = {
        label: val
    }
    return props
}
