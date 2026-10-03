import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function TodoCard({ items }: { items: string[] }) {
  return (
    <Card className="max-w-[60ch] rounded-lg border border-dashed border-border bg-transparent shadow-none ring-0">
      <CardHeader>
        <CardTitle className="font-sans text-xl font-semibold">
          TODO: not built yet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
