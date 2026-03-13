"""Distance correlation analysis with FDR BH correction."""

import os

import click
import dcor
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
from sklearn.impute import SimpleImputer, KNNImputer
from statsmodels.stats.multitest import multipletests


def read_data_file(file_path: str) -> pd.DataFrame:
    """Read data file based on extension."""
    if file_path.endswith(".csv"):
        return pd.read_csv(file_path, sep=",")
    return pd.read_csv(file_path, sep="\t")


def get_sample_column_name(annotation: pd.DataFrame) -> str:
    """Find the Sample column in the annotation dataframe."""
    for col in annotation.columns:
        if col.lower() == 'sample':
            return col
    raise ValueError("Annotation file must have a 'Sample' column")


def impute_data(
    data: pd.DataFrame,
    method: str,
    knn_neighbors: int = 5
) -> pd.DataFrame:
    """
    Impute missing values in the data using sklearn imputers.

    Args:
        data: Data matrix with proteins as rows and samples as columns.
        method: Imputation method ('none', 'mean', 'median', 'zero', 'knn').
        knn_neighbors: Number of neighbors for KNN imputation.

    Returns:
        DataFrame with imputed values.

    Raises:
        ValueError: If method is 'none' and NaN values exist.
    """
    if method == "none":
        return data

    if method == "knn":
        imputer = KNNImputer(n_neighbors=knn_neighbors)
    elif method == "mean":
        imputer = SimpleImputer(strategy="mean")
    elif method == "median":
        imputer = SimpleImputer(strategy="median")
    elif method == "zero":
        imputer = SimpleImputer(strategy="constant", fill_value=0)
    else:
        raise ValueError(f"Unknown imputation method: {method}")

    imputed_values = imputer.fit_transform(data.values)
    return pd.DataFrame(imputed_values, index=data.index, columns=data.columns)


def calculate_distance_correlation(
    data: pd.DataFrame,
    annotation: pd.DataFrame,
    index_col: str,
    target_cols: list[str],
    imputation: str = "none",
    log2_transform: bool = False,
    knn_neighbors: int = 5,
    num_resamples: int = 199,
    sample_indices: list = None
) -> pd.DataFrame:
    """
    Calculate distance correlation for each protein with multiple target columns.

    Args:
        data: Data matrix with proteins as rows.
        annotation: Annotation dataframe with Sample and target columns.
        index_col: Name of the protein identifier column.
        target_cols: List of target column names in annotation.
        imputation: Imputation method.
        log2_transform: Whether to apply log2 transformation.
        knn_neighbors: Number of neighbors for KNN imputation.
        num_resamples: Number of resamples for permutation test.
        sample_indices: Optional list of sample names to use (for group-based analysis).

    Returns:
        DataFrame with distance correlation results.
    """
    sample_column_name = get_sample_column_name(annotation)

    annotation = annotation.copy()
    for target_col in target_cols:
        if target_col not in annotation.columns:
            raise ValueError(f"Target column '{target_col}' not found in annotation file")
        annotation[target_col] = pd.to_numeric(annotation[target_col], errors='coerce')

    if sample_indices is not None:
        annotation = annotation[annotation[sample_column_name].isin(sample_indices)]

    sample_columns = annotation[sample_column_name].tolist()

    valid_samples = []
    for sample in sample_columns:
        if sample in data.columns:
            sample_row = annotation[annotation[sample_column_name] == sample]
            if len(sample_row) > 0:
                all_valid = all(pd.notna(sample_row[tc].values[0]) for tc in target_cols)
                if all_valid:
                    valid_samples.append(sample)

    if len(valid_samples) < 3:
        raise ValueError(
            f"Not enough valid samples with all target values. Found {len(valid_samples)}, need at least 3"
        )

    target_matrix = annotation[annotation[sample_column_name].isin(valid_samples)][target_cols].values

    if index_col in data.columns:
        data = data.set_index(index_col)
    data_subset = data[valid_samples].copy()

    if log2_transform:
        data_subset = np.log2(data_subset.replace(0, np.nan))
        data_subset.replace([np.inf, -np.inf], np.nan, inplace=True)

    data_subset = impute_data(data_subset, imputation, knn_neighbors)

    results_list = []
    for protein, values in data_subset.iterrows():
        x = values.values.astype(float)

        mask = ~np.isnan(x)
        for tc in target_cols:
            target_vals = annotation[annotation[sample_column_name].isin(valid_samples)][tc].values
            mask = mask & ~np.isnan(target_vals)

        x_valid = x[mask]
        target_valid = target_matrix[mask]
        n = len(x_valid)

        if n >= 3:
            if np.std(x_valid) == 0:
                results_list.append({
                    'Protein': protein,
                    'Distance_Correlation': np.nan,
                    'P_Value': np.nan,
                    'N_Samples': n,
                    'Target_Columns': ','.join(target_cols)
                })
            else:
                corr = dcor.distance_correlation(x_valid, target_valid)
                test_result = dcor.independence.distance_covariance_test(
                    x_valid, target_valid, num_resamples=num_resamples
                )
                results_list.append({
                    'Protein': protein,
                    'Distance_Correlation': corr,
                    'P_Value': test_result.pvalue,
                    'N_Samples': n,
                    'Target_Columns': ','.join(target_cols)
                })
        else:
            results_list.append({
                'Protein': protein,
                'Distance_Correlation': np.nan,
                'P_Value': np.nan,
                'N_Samples': n,
                'Target_Columns': ','.join(target_cols)
            })

    return pd.DataFrame(results_list)


def apply_fdr_correction(
    results: pd.DataFrame,
    alpha: float = 0.05
) -> pd.DataFrame:
    """Apply Benjamini-Hochberg FDR correction."""
    results = results.copy()

    valid_mask = ~results['P_Value'].isna()
    valid_pvalues = results.loc[valid_mask, 'P_Value'].values

    if len(valid_pvalues) == 0:
        results['Q_Value'] = np.nan
        results['Significant'] = False
        return results

    rejected, qvalues, _, _ = multipletests(
        valid_pvalues,
        alpha=alpha,
        method='fdr_bh'
    )

    results['Q_Value'] = np.nan
    results['Significant'] = False
    results.loc[valid_mask, 'Q_Value'] = qvalues
    results.loc[valid_mask, 'Significant'] = rejected

    return results


def generate_scatter_plots(
    data: pd.DataFrame,
    annotation: pd.DataFrame,
    results: pd.DataFrame,
    index_col: str,
    target_cols: list[str],
    output_dir: str,
    top_n: int = 9
):
    """Generate scatter plots for top significant proteins."""
    sig_results = results[results['Significant'] == True].nsmallest(top_n, 'P_Value')

    if len(sig_results) == 0:
        return

    sample_col = None
    for col in annotation.columns:
        if col.lower() == 'sample':
            sample_col = col
            break

    if sample_col is None:
        return

    if index_col in data.columns:
        data = data.set_index(index_col)

    target_col = target_cols[0] if target_cols else None
    if target_col is None:
        return

    n_plots = len(sig_results)
    n_cols = min(3, n_plots)
    n_rows = (n_plots + n_cols - 1) // n_cols

    fig = make_subplots(
        rows=n_rows, cols=n_cols,
        subplot_titles=[str(p)[:30] for p in sig_results['Protein'].tolist()]
    )

    for idx, (_, row) in enumerate(sig_results.iterrows()):
        protein = row['Protein']
        dcor_val = row['Distance_Correlation']
        p_val = row['P_Value']
        r_idx = idx // n_cols + 1
        c_idx = idx % n_cols + 1

        if protein not in data.index:
            continue

        protein_values = data.loc[protein]

        plot_data = []
        for _, ann_row in annotation.iterrows():
            sample = ann_row[sample_col]
            if sample in protein_values.index:
                val = protein_values[sample]
                target_val = ann_row[target_col]
                if pd.notna(val) and pd.notna(target_val):
                    plot_data.append({'abundance': val, 'target': float(target_val)})

        if not plot_data:
            continue

        plot_df = pd.DataFrame(plot_data)

        fig.add_trace(
            go.Scatter(
                x=plot_df['target'],
                y=plot_df['abundance'],
                mode='markers',
                marker=dict(size=8, opacity=0.7, color='#9b59b6'),
                name=str(protein)[:20],
                showlegend=False,
                hovertemplate=f'dCor={dcor_val:.3f}, p={p_val:.2e}<extra></extra>'
            ),
            row=r_idx, col=c_idx
        )

    fig.update_layout(
        title=f'Top {len(sig_results)} Significant Distance Correlations',
        template='plotly_white',
        height=350 * n_rows,
        width=350 * n_cols
    )

    fig.write_html(os.path.join(output_dir, 'scatter_plots.html'))


def generate_ranked_bar_plot(
    results: pd.DataFrame,
    output_dir: str,
    top_n: int = 30
):
    """Generate ranked bar plot of top distance correlations."""
    valid_results = results.dropna(subset=['Distance_Correlation', 'P_Value'])
    plot_df = valid_results.nlargest(top_n, 'Distance_Correlation')
    plot_df = plot_df.sort_values('Distance_Correlation', ascending=True)

    if len(plot_df) == 0:
        return

    fig = go.Figure()

    fig.add_trace(go.Bar(
        y=[str(p)[:40] for p in plot_df['Protein']],
        x=plot_df['Distance_Correlation'],
        orientation='h',
        marker_color='#9b59b6',
        hovertemplate='%{y}<br>dCor=%{x:.4f}<extra></extra>'
    ))

    fig.update_layout(
        title=f'Top {len(plot_df)} Distance Correlations',
        xaxis_title='Distance Correlation',
        yaxis_title='Protein',
        template='plotly_white',
        height=max(400, len(plot_df) * 25),
        width=800
    )

    fig.write_html(os.path.join(output_dir, 'ranked_correlations.html'))


def generate_volcano_plot(
    results: pd.DataFrame,
    output_dir: str,
    alpha: float = 0.05,
    suffix: str = "",
    title_suffix: str = ""
):
    """Generate volcano plot (distance correlation vs -log10 p-value)."""
    plot_df = results.copy()
    plot_df['neg_log10_pvalue'] = -np.log10(plot_df['P_Value'].clip(lower=1e-300))

    plot_df['Status'] = np.where(
        plot_df['Significant'],
        'Significant',
        'Not Significant'
    )

    color_map = {
        'Significant': '#e74c3c',
        'Not Significant': '#95a5a6'
    }

    title = 'Volcano Plot: Distance Correlation'
    if title_suffix:
        title = f'{title} - {title_suffix}'

    fig = px.scatter(
        plot_df,
        x='Distance_Correlation',
        y='neg_log10_pvalue',
        color='Status',
        color_discrete_map=color_map,
        hover_name='Protein',
        hover_data={
            'Distance_Correlation': ':.4f',
            'P_Value': ':.2e',
            'Q_Value': ':.2e',
            'Status': False
        },
        title=title
    )

    fig.add_hline(
        y=-np.log10(alpha),
        line_dash="dash",
        line_color="gray",
        annotation_text=f"p = {alpha}"
    )

    fig.update_layout(
        xaxis_title='Distance Correlation',
        yaxis_title='-log10(P-value)',
        template='plotly_white',
        width=900,
        height=700
    )

    fig.update_traces(marker=dict(size=6, opacity=0.7))

    filename = f"volcano_plot{suffix}.html" if suffix else "volcano_plot.html"
    fig.write_html(os.path.join(output_dir, filename))


def sanitize_filename(name: str) -> str:
    """Sanitize a string for use as a filename."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in str(name))


@click.command()
@click.option("--input_file", "-i", required=True, help="Path to the input data file")
@click.option("--annotation_file", "-a", required=True, help="Path to the annotation file")
@click.option("--index_col", "-x", required=True, help="Name of the protein identifier column")
@click.option("--target_cols", "-t", required=True, help="Comma-separated list of target column names")
@click.option("--grouping_col", "-g", default="", help="Column to group samples for separate volcano plots")
@click.option("--imputation", type=click.Choice(["none", "mean", "median", "zero", "knn"]), default="none", help="Imputation method")
@click.option("--knn_neighbors", type=int, default=5, help="Number of neighbors for KNN imputation")
@click.option("--num_resamples", type=int, default=199, help="Number of resamples for permutation test")
@click.option("--alpha", type=float, default=0.05, help="Significance threshold for FDR")
@click.option("--log2_transform", "-l", is_flag=True, help="Apply log2 transformation")
@click.option("--output_dir", "-o", required=True, help="Output directory")
def main(
    input_file: str,
    annotation_file: str,
    index_col: str,
    target_cols: str,
    grouping_col: str,
    imputation: str,
    knn_neighbors: int,
    num_resamples: int,
    alpha: float,
    log2_transform: bool,
    output_dir: str
):
    """Calculate distance correlation with FDR BH correction."""
    os.makedirs(output_dir, exist_ok=True)

    data = read_data_file(input_file)
    annotation = read_data_file(annotation_file)
    sample_column_name = get_sample_column_name(annotation)

    target_col_list = [t.strip() for t in target_cols.split(",")]

    results = calculate_distance_correlation(
        data=data,
        annotation=annotation,
        index_col=index_col,
        target_cols=target_col_list,
        imputation=imputation,
        log2_transform=log2_transform,
        knn_neighbors=knn_neighbors,
        num_resamples=num_resamples
    )

    results = apply_fdr_correction(results, alpha=alpha)

    generate_volcano_plot(results, output_dir, alpha=alpha)
    generate_ranked_bar_plot(results, output_dir)
    generate_scatter_plots(data, annotation, results, index_col, target_col_list, output_dir)

    if grouping_col and grouping_col in annotation.columns:
        groups = annotation[grouping_col].dropna().unique()
        print(f"Generating volcano plots for {len(groups)} groups in '{grouping_col}'")

        for group in groups:
            group_samples = annotation[annotation[grouping_col] == group][sample_column_name].tolist()

            try:
                group_results = calculate_distance_correlation(
                    data=data,
                    annotation=annotation,
                    index_col=index_col,
                    target_cols=target_col_list,
                    imputation=imputation,
                    log2_transform=log2_transform,
                    knn_neighbors=knn_neighbors,
                    num_resamples=num_resamples,
                    sample_indices=group_samples
                )
                group_results = apply_fdr_correction(group_results, alpha=alpha)

                suffix = f"_{sanitize_filename(group)}"
                generate_volcano_plot(
                    group_results,
                    output_dir,
                    alpha=alpha,
                    suffix=suffix,
                    title_suffix=str(group)
                )

                group_results['Group'] = group
                group_results.to_csv(
                    os.path.join(output_dir, f"correlation_results_{sanitize_filename(group)}.tsv"),
                    sep="\t",
                    index=False
                )
                print(f"  Group '{group}': {len(group_samples)} samples, {(group_results['Significant']).sum()} significant")

            except ValueError as e:
                print(f"  Group '{group}': Skipped - {e}")

    results = results.sort_values('P_Value', ascending=True)

    results.to_csv(
        os.path.join(output_dir, "correlation_results.tsv"),
        sep="\t",
        index=False
    )

    significant = results[results['Significant'] == True].copy()
    significant.to_csv(
        os.path.join(output_dir, "significant_correlations.tsv"),
        sep="\t",
        index=False
    )

    print(f"Total proteins analyzed: {len(results)}")
    print(f"Significant correlations (FDR < {alpha}): {len(significant)}")


if __name__ == "__main__":
    main()
