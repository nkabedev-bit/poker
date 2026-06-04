type PlaceholderAdminPageProps = {
  title: string;
  description: string;
  actions?: string[];
};

export function PlaceholderAdminPage({
  actions = [],
  description,
  title,
}: PlaceholderAdminPageProps) {
  return (
    <section className="poker-panel placeholder-panel">
      <div>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>
      {actions.length > 0 ? (
        <div className="placeholder-actions">
          {actions.map((action) => (
            <button className="gold-outline-button" key={action} type="button">
              {action}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
